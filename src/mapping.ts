import { BigInt } from "@graphprotocol/graph-ts";
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
import { ExampleEntity } from "../generated/schema";

export function handleBalanceUpdate(event: BalanceUpdate): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  let entity = new ExampleEntity(event.transaction.from.toHex());
  entity.save();

  // Entity fields can be set using simple assignments
  entity.count = BigInt.fromI32(0);

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromI32(1);

  // Entity fields can be set based on event parameters
  entity.claimAddress = event.params.claimAddress;
  entity.newTotal = event.params.newTotal;

  // Entities can be written to the store with `.save()`
  entity.save();

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
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

export function handleChallenge(event: Challenge): void {}

export function handleContribution(event: Contribution): void {}

export function handleDebunked(event: Debunked): void {}

export function handleDispute(event: Dispute): void {}

export function handleEvidence(event: Evidence): void {}

export function handleMetaEvidence(event: MetaEvidence): void {}

export function handleNewClaim(event: NewClaim): void {}

export function handleRuling(event: Ruling): void {}

export function handleRulingFunded(event: RulingFunded): void {}

export function handleTimelockStarted(event: TimelockStarted): void {}

export function handleWithdrawal(event: Withdrawal): void {}

export function handleWithdrew(event: Withdrew): void {}
