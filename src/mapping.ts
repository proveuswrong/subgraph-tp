import { BigInt, log } from "@graphprotocol/graph-ts";
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

export function handleBalanceUpdate(event: BalanceUpdate): void {
  let claimStorage = ClaimStorage.load(event.params.claimAddress.toHex());

  if (!claimStorage) claimStorage = new ClaimStorage(event.params.claimAddress.toHex());

  let claimID = claimStorage.claimID;

  let claim = Claim.load(claimID);

  if (!claim) claim = new Claim(claimID);

  // Entity fields can be set based on event parameters
  claim.bounty = event.params.newTotal;
  claim.status = "Live";

  // Entities can be written to the store with `.save()`
  claim.save();

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  let contract = ProveMeWrong.bind(event.address);
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.ARBITRATOR(...)
  // - contract.ARBITRATOR_EXTRA_DATA(...)
  // - contract.CLAIM_WITHDRAWAL_TIMELOCK(...)
  // - contract.LOSER_APPEAL_PERIOD_MULTIPLIER(...)
  // - contract.LOSER_STAKE_MULTIPLIER(...)
  // - contract.MULTIPLIER_DENOMINATOR(...)
  // - contract.NUMBER_OF_LEAST_SIGNIFICANT_BITS_TO_IGNORE(...)
  // - contract.NUMBER_OF_RULING_OPTIONS(...)
  // - contract.PMW_VERSION(...)
  // - contract.WINNER_STAKE_MULTIPLIER(...)
  // - contract.appealFee(...)
  // - contract.challengeFee(...)
  // - contract.claimStorage(...)
  // - contract.findVacantStorageSlot(...)
  // - contract.getTotalWithdrawableAmount(...)
  // - contract.withdrawFeesAndRewards(...)
}

export function handleChallenge(event: Challenge): void {
  let claimStorage = ClaimStorage.load(event.params.claimAddress.toHex());

  if (!claimStorage) claimStorage = new ClaimStorage(event.params.claimAddress.toHex());

  let claimID = claimStorage.claimID;

  let claim = Claim.load(claimID);

  if (!claim) claim = new Claim(claimID);

  // Entity fields can be set based on event parameters
  claim.status = "Challenged";

  // Entities can be written to the store with `.save()`
  claim.save();
}

export function handleContribution(event: Contribution): void {}

export function handleDebunked(event: Debunked): void {
  let claimStorage = ClaimStorage.load(event.params.claimAddress.toHex());

  if (!claimStorage) claimStorage = new ClaimStorage(event.params.claimAddress.toHex());

  let claimID = claimStorage.claimID;

  let claim = Claim.load(claimID);

  if (!claim) claim = new Claim(claimID);

  // Entity fields can be set based on event parameters
  claim.status = "Debunked";

  // Entities can be written to the store with `.save()`
  claim.save();
}

export function handleDispute(event: Dispute): void {}

export function handleEvidence(event: Evidence): void {}

export function handleMetaEvidence(event: MetaEvidence): void {}

export function handleNewClaim(event: NewClaim): void {
  let claimStorage = new ClaimStorage(event.params.claimAddress.toHex());
  claimStorage.claimID = event.params.claimID.toHex();

  claimStorage.save();

  let claim = new Claim(claimStorage.claimID);
  claim.claimStorageAddress = event.params.claimAddress;
  claim.status = "Live";

  claim.save();
}

export function handleRuling(event: Ruling): void {}

export function handleRulingFunded(event: RulingFunded): void {}

export function handleTimelockStarted(event: TimelockStarted): void {
  let claimStorage = ClaimStorage.load(event.params.claimAddress.toHex());

  if (!claimStorage) claimStorage = new ClaimStorage(event.params.claimAddress.toHex());

  let claimID = claimStorage.claimID;

  let claim = Claim.load(claimID);

  if (!claim) claim = new Claim(claimID);

  claim.status = "TimelockStarted";

  claim.save();
}

export function handleWithdrawal(event: Withdrawal): void {}

export function handleWithdrew(event: Withdrew): void {
  let claimStorage = ClaimStorage.load(event.params.claimAddress.toHex());

  if (!claimStorage) claimStorage = new ClaimStorage(event.params.claimAddress.toHex());

  let claimID = claimStorage.claimID;

  let claim = Claim.load(claimID);

  if (!claim) claim = new Claim(claimID);

  claim.status = "Withdrawn";

  claim.save();
}
