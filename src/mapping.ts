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
import { Claim, ClaimStorage } from "../generated/schema";

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
  // How to update score of each Claim, on each block (or every nth block)?
}

export function handleNewClaim(event: NewClaim): void {
  let claimStorage = new ClaimStorage(event.params.claimAddress.toString());
  claimStorage.claimEntityID = event.params.claimAddress.toString() + "-" + event.block.number.toString();
  claimStorage.save();

  let claim = new Claim(claimStorage.claimEntityID);
  claim.claimID = event.params.claimID.toString();
  claim.claimStorageAddress = event.params.claimAddress;
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

export function handleWithdrawal(event: Withdrawal): void {}
export function handleContribution(event: Contribution): void {}
export function handleDispute(event: Dispute): void {}
export function handleEvidence(event: Evidence): void {}
export function handleMetaEvidence(event: MetaEvidence): void {}
export function handleRuling(event: Ruling): void {}
export function handleRulingFunded(event: RulingFunded): void {}
