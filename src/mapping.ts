import { ethereum, BigInt, log, Address, Bytes } from "@graphprotocol/graph-ts";
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
  ClaimWithdrawn
} from "../generated/ProveMeWrong/ProveMeWrong";

import {
  Claim,
  ClaimStorage,
  EventEntity,
  EvidenceEntity,
  ContributionEntity,
  MetaEvidenceEntity,
  DisputeEntity,
  CrowdfundingStatus, Arbitrator
} from "../generated/schema";
import {PolicyUpdate} from "../generated/PolicyRegistry/PolicyRegistry";
import {KlerosLiquid, NewPhase} from "../generated/KlerosLiquid/KlerosLiquid";

import { dataSource } from "@graphprotocol/graph-ts";


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

function getPopulatedEventEntity(
  event: ethereum.Event,
  name: string,
  claimID: string,
  details: string | null = null,
  from: Address | null = event.transaction.from
): EventEntity {
  let entity = new EventEntity(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  entity.name = name;
  entity.claim = claimID;
  if (details) entity.details = details;
  if (from) entity.from = from;

  entity.timestamp = event.block.timestamp;

  return entity;
}

export function handlePolicyUpdate(event: PolicyUpdate): void {
  const ADDRESS = "0x1128eD55ab2d796fa92D2F8E1f336d745354a77A"; // TODO This is duplicated, try to obtain from subgraph.yaml.

  let arbitratorEntity = Arbitrator.load(ADDRESS);
  if(!arbitratorEntity) arbitratorEntity = new Arbitrator(ADDRESS);

  const arbitrator = KlerosLiquid.bind(Address.fromBytes(Address.fromHexString(ADDRESS)));

  const timesPerPeriod = arbitrator.getSubcourt(event.params._subcourtID).getTimesPerPeriod();

   (arbitratorEntity.policies = arbitratorEntity.policies || new Array<String>())[event.params._subcourtID.toI32()] = event.params._policy;
  (arbitratorEntity.evidencePeriods = arbitratorEntity.evidencePeriods || new Array<i32>())[event.params._subcourtID.toI32()] = timesPerPeriod[0].toI32();
  (arbitratorEntity.commitPeriods = arbitratorEntity.commitPeriods || new Array<i32>())[event.params._subcourtID.toI32()] = timesPerPeriod[1].toI32();
  (arbitratorEntity.votingPeriods = arbitratorEntity.votingPeriods || new Array<i32>())[event.params._subcourtID.toI32()] = timesPerPeriod[2].toI32();
  (arbitratorEntity.appealPeriods = arbitratorEntity.appealPeriods || new Array<i32>())[event.params._subcourtID.toI32()] = timesPerPeriod[3].toI32();

  arbitratorEntity.save();
}

export function handleNewClaim(event: NewClaim): void {
  let claimStorage = new ClaimStorage(event.params.claimAddress.toString());

  claimStorage.claimEntityID = event.params.claimAddress.toString() + "-" + event.block.number.toString();
  claimStorage.save();

  let claim = new Claim(claimStorage.claimEntityID);
  claim.claimID = event.params.claimID.toString();
  claim.owner = event.transaction.from;
  claim.category = event.params.category;
  claim.status = "Live";
  claim.bounty = BigInt.fromI32(0);
  claim.withdrawalPermittedAt = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;
  claim.createdAtBlock = event.block.number;
  claim.createdAtTimestamp = event.block.timestamp;
  claim.lastCalculatedScore = BigInt.fromI32(0);

  let contract = ProveMeWrong.bind(event.address);
  const ARBITRATOR_CONTRACT_ADDRESS = contract.ARBITRATOR();
  const ARBITRATOR_EXTRA_DATA = contract.categoryToArbitratorExtraData(BigInt.fromI32(0));
  claim.arbitrator = ARBITRATOR_CONTRACT_ADDRESS.toString();
  claim.arbitratorExtraData = ARBITRATOR_EXTRA_DATA;

  claim.save();

  getPopulatedEventEntity(event, "NewClaim", claim.id, event.params.category.toString()).save();
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

  getPopulatedEventEntity(event, "BalanceUpdate", claim.id, event.params.newTotal.toString()).save();
}

export function handleChallenge(event: Challenge): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Challenged";
  claim.challenger = event.transaction.from;
  claim.save();

  getPopulatedEventEntity(event, "Challenge", claim.id).save();

  let dispute = new DisputeEntity(event.params.disputeID.toString()) as DisputeEntity;

  dispute.claim = claim.id;
  dispute.save();
}

export function handleDebunked(event: Debunked): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Debunked";
  claim.bounty = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;
  claim.lastCalculatedScore = BigInt.fromI32(0);

  claim.save();

  getPopulatedEventEntity(event, "Debunked", claim.id).save();
}

export function handleTimelockStarted(event: TimelockStarted): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  let contract = ProveMeWrong.bind(event.address);

  const CLAIM_WITHDRAWAL_TIMELOCK = contract.CLAIM_WITHDRAWAL_TIMELOCK();
  let withdrawalPermittedAt = CLAIM_WITHDRAWAL_TIMELOCK.plus(event.block.timestamp);

  claim.status = "TimelockStarted";
  claim.withdrawalPermittedAt = withdrawalPermittedAt;

  let newScore = event.block.number
    .minus(claim.lastBalanceUpdate)
    .times(claim.bounty)
    .plus(claim.lastCalculatedScore);
  claim.lastCalculatedScore = newScore;
  claim.lastBalanceUpdate = event.block.number;

  claim.save();

  getPopulatedEventEntity(event, "TimelockStarted", claim.id, withdrawalPermittedAt.toString()).save();
}

export function handleClaimWithdrawal(event: ClaimWithdrawn): void {
  let claim = getClaimEntityInstance(event.params.claimAddress);

  claim.status = "Withdrawn";
  claim.bounty = BigInt.fromI32(0);
  claim.lastBalanceUpdate = event.block.number;

  claim.save();

  getPopulatedEventEntity(event, "ClaimWithdrawal", claim.id, claim.lastCalculatedScore.toString()).save();
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

  getPopulatedEventEntity(event, "ClaimWithdrawal", claim.id, event.transaction.value.toString()).save();

  let disputes = claim.disputes;
  let lastIndex = disputes ? disputes.length - 1 : 0;
  let lastDisputeId = disputes ? disputes[lastIndex] : BigInt.fromI32(0).toString();

  const contributionEntityID =
    lastDisputeId + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) contributionEntity = new ContributionEntity(contributionEntityID);

  contributionEntity.amount = contributionEntity.amount.plus(event.params.amount);

  contributionEntity.save();
}

export function handleMetaEvidence(event: MetaEvidence): void {
  const metaEvidenceEntity = new MetaEvidenceEntity(event.params._metaEvidenceID.toString());
  metaEvidenceEntity.uri = event.params._evidence;

  metaEvidenceEntity.save();
}

export function handleWithdrawal(event: Withdrawal): void {
  let claim = getClaimEntityInstance(event.params.claimStorageAddress);

  getPopulatedEventEntity(event, "Withdrawal", claim.id).save();

  let disputes = claim.disputes;
  let lastIndex = disputes ? disputes.length - 1 : 0;
  let lastDisputeId = disputes ? disputes[lastIndex] : BigInt.fromI32(0).toString();

  const contributionEntityID =
    lastDisputeId + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) {
    log.error("There is no contribution entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [contributionEntityID]);
    return;
  }

  contributionEntity.withdrew = true;

  contributionEntity.save();
}

export function handleDispute(event: Dispute): void {
  // const disputeEntity = new DisputeEntity(event.params._disputeID.toString());
  // disputeEntity.save();
}

export function handleNewPhase(event: NewPhase): void {
  // you can safely delete this comment
}


export function handleRuling(event: Ruling): void {
  const disputeEntity = DisputeEntity.load(event.params._disputeID.toString());

  if (!disputeEntity) {
    log.error("There is no dispute with id {}. However, this is impossible. There must be a bug within the subgraph.", [event.params._disputeID.toString()]);
    return;
  }

  let claim = getClaimEntityInstance(BigInt.fromString(disputeEntity.claim.split("-")[0]));

  disputeEntity.ruled = true;
  disputeEntity.ruling = event.params._ruling;
  disputeEntity.save();

  if (event.params._ruling.equals(BigInt.fromI32(2))) {
    claim.status = "Debunked";
  } else {
    claim.status = "Live";
  }

  claim.save();

  getPopulatedEventEntity(event, "Ruling", claim.id, event.params._ruling.toString(), event.params._arbitrator).save();
}

export function handleRulingFunded(event: RulingFunded): void {
  let claim = getClaimEntityInstance(event.params.claimStorageAddress);

  getPopulatedEventEntity(event, "RulingFunded", claim.id, event.params.ruling.toString()).save();

  let disputes = claim.disputes;
  let lastIndex = disputes ? disputes.length - 1 : 0;
  let lastDisputeId = disputes ? disputes[lastIndex] : BigInt.fromI32(0).toString();
  const crowdfundingStatus = new CrowdfundingStatus(lastDisputeId + "-" + event.params.round.toString() + "-" + event.params.ruling.toString());

  crowdfundingStatus.fullyFunded = true;

  crowdfundingStatus.save();
}
