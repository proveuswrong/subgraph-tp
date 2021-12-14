import { ethereum, BigInt, log } from "@graphprotocol/graph-ts";
import {
  ProveMeWrong,
  BalanceUpdate,
  Challenge,
  Contribution,
  Debunked,
  Dispute,
  Evidence,
  MetaEvidence,
  NewClaim,
  Ruling,
  RulingFunded,
  TimelockStarted,
  Withdrawal,
  Withdrew
} from "../generated/ProveMeWrong/ProveMeWrong";
import { Claim, ClaimStorage, EvidenceEntity, ContributionEntity, MetaEvidenceEntity, DisputeEntity, CrowdfundingStatus } from "../generated/schema";

function getClaimEntityInstance(claimStorageAddress: BigInt): Claim {
  let claimStorage = ClaimStorage.load(claimStorageAddress.toString());
  if (!claimStorage) {
    log.error("There is no claim at storage address {}. However, this is impossible. There must be a bug within the subgraph.", [
      claimStorageAddress.toString()
    ]);
    throw new InternalError("There is no claim at given storage address.");
  }

  let claimEntityID = claimStorage.claimEntityID;
  let claim = Claim.load(claimEntityID);

  if (!claim) {
    log.error("There is no claim entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [claimEntityID]);
    throw new InternalError("There is no claim entity with given id.");
  }

  return claim;
}

export function handleBlock(block: ethereum.Block): void {
  /* How to update score of each Claim, on each block (or every nth block)? It would be convenient to do this, but not badly needed.
   * Currently, we are storing past scores when a bounty increase happens. So the formula to calculate the score for the front-end is to evaluate this expression: `lastCalculatedScore + (currentBlock - lastBalanceUpdate) * bounty`.
   */
}

export function handleNewClaim(event: NewClaim): void {
  let claimStorage = new ClaimStorage(event.params.claimAddress.toString());
  claimStorage.claimEntityID = event.params.claimAddress.toString() + "-" + event.block.number.toString();
  claimStorage.save();

  let claim = new Claim(claimStorage.claimEntityID);
  claim.claimID = event.params.claimID.toString();
  claim.status = "Live";
  claim.withdrawalPermittedAt = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;
  claim.lastCalculatedScore = BigInt.fromI32(0);

  claim.save();
}

export function handleBalanceUpdate(event: BalanceUpdate): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  let newScore = event.block.number
    .minus(claim.lastBalanceUpdate)
    .times(claim.bounty)
    .plus(claim.lastCalculatedScore);

  claim.lastCalculatedScore = newScore;
  claim.lastBalanceUpdate = event.block.number;
  claim.status = "Live";
  claim.bounty = event.params.newTotal;
  claim.save();
}

export function handleChallenge(event: Challenge): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Challenged";
  claim.challenger = event.transaction.from;
  claim.disputeID = event.params.disputeID;
  claim.save();
}

export function handleDebunked(event: Debunked): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Debunked";
  claim.bounty = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;
  claim.lastCalculatedScore = BigInt.fromI32(0);

  claim.save();
}

export function handleTimelockStarted(event: TimelockStarted): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  let contract = ProveMeWrong.bind(event.address);

  const CLAIM_WITHDRAWAL_TIMELOCK = contract.CLAIM_WITHDRAWAL_TIMELOCK();
  let withdrawalPermittedAt = event.block.timestamp + CLAIM_WITHDRAWAL_TIMELOCK;

  claim.status = "TimelockStarted";
  claim.withdrawalPermittedAt = withdrawalPermittedAt;

  let newScore = event.block.number
    .minus(claim.lastBalanceUpdate)
    .times(claim.bounty)
    .plus(claim.lastCalculatedScore);
  claim.lastCalculatedScore = newScore;
  claim.lastBalanceUpdate = event.block.number;

  claim.save();
}

export function handleWithdrew(event: Withdrew): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Withdrawn";
  claim.bounty = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;

  claim.save();
}
export function handleEvidence(event: Evidence): void {
  let evidenceEntity = new EvidenceEntity(event.params._evidenceGroupID.toString());

  evidenceEntity.uri = event.params._evidence;
  evidenceEntity.sender = event.transaction.from;
  evidenceEntity.blockNumber = event.block.number;

  evidenceEntity.save();
}
export function handleContribution(event: Contribution): void {
  let claim = getClaimEntityInstance(event.params.claimStorageAddress);

  let disputeID = claim.disputeID | BigInt.fromI32(0);

  const contributionEntityID =
    disputeID.toString() + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) contributionEntity = new ContributionEntity(contributionEntityID);

  contributionEntity.amount = contributionEntity.amount.plus(event.params.amount);

  contributionEntity.save();
}

export function handleMetaEvidence(event: MetaEvidence): void {
  const metaEvidenceEntity = new MetaEvidenceEntity(event.block.number.toString());
  metaEvidenceEntity.uri = event.params._evidence;

  metaEvidenceEntity.save();
}

export function handleWithdrawal(event: Withdrawal): void {
  let claim = getClaimEntityInstance(event.params.claimStorageAddress);

  let disputeID = claim.disputeID | BigInt.fromI32(0);

  const contributionEntityID =
    disputeID.toString() + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) {
    log.error("There is no contribution entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [contributionEntityID]);
    return;
  }

  contributionEntity.withdrew = true;

  contributionEntity.save();
}

export function handleDispute(event: Dispute): void {
  const disputeEntity = new DisputeEntity(event.params._disputeID.toString());
  disputeEntity.save();
}
export function handleRuling(event: Ruling): void {
  const disputeEntity = DisputeEntity.load(event.params._disputeID.toString());

  if (!disputeEntity) {
    log.error("There is no dispute with id {}. However, this is impossible. There must be a bug within the subgraph.", [event.params._disputeID.toString()]);
    return;
  }

  disputeEntity.ruled = true;
  disputeEntity.ruling = event.params._ruling;
  disputeEntity.save();
}

export function handleRulingFunded(event: RulingFunded): void {
  let claim = getClaimEntityInstance(event.params.claimStorageAddress);
  let disputeID = claim.disputeID | BigInt.fromI32(0);

  const crowdfundingStatus = new CrowdfundingStatus(disputeID.toString() + "-" + event.params.round.toString() + "-" + event.params.ruling.toString());

  crowdfundingStatus.fullyFunded = true;

  crowdfundingStatus.save();
}
