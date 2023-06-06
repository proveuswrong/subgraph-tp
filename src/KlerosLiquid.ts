import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  AppealDecision,
  AppealPossible,
  CastVoteCall,
  ExecuteDelayedSetStakesCall,
  KlerosLiquid,
  NewPeriod,
  NewPhase,
  StakeSet
} from "../generated/KlerosLiquid/KlerosLiquid";
import { ArbitratorEntity, DisputeEntity, RoundEntity } from "../generated/schema";
import { TruthPost } from "../generated/TruthPost/TruthPost";
import { createRound, getLastRoundIndex, updateRoundAppealDeadline } from "./entities/Round";
import { getPeriodName, getPhaseName } from "./utils";

const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);

export function handleCastVote(call: CastVoteCall): void {
  const disputeID = call.inputs._disputeID;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  // TODO: find a way to use it instead of getLastRoundIndex() used below
  // const lastRoundIndex = disputeEntity.rounds.length- 1;
  const lastRoundIndex = getLastRoundIndex(disputeID);
  const roundID = `${disputeID}-${lastRoundIndex}`;
  const roundEntity = RoundEntity.load(roundID);
  if (!roundEntity) {
    log.error("There is no round with id {} in dipsute id {}. However, this is impossible. There must be a bug within the subgraph.", [
      lastRoundIndex.toString(),
      call.inputs._disputeID.toString()
    ]);
    return;
  }

  const votesPerChoiceArray = roundEntity.votesPerChoice;
  const choiceIndex = call.inputs._choice.toI32();
  const voteSize = call.inputs._voteIDs.length;
  votesPerChoiceArray[choiceIndex] = votesPerChoiceArray[choiceIndex].plus(BigInt.fromI32(voteSize));

  roundEntity.votesPerChoice = votesPerChoiceArray;
  roundEntity.save();
}

export function handleAppealDecision(event: AppealDecision): void {
  const truthPost = TruthPost.bind(event.params._arbitrable);
  if (!truthPost) return; // Filter out other IArbitrable contracts

  const disputeID = event.params._disputeID;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  const lastRoundIndex = getLastRoundIndex(disputeID);
  const newRoundIndex = lastRoundIndex.plus(BigInt.fromI32(1)).toI32();

  const arbitrator = KlerosLiquid.bind(event.address);
  const jurySize = arbitrator.getDispute(disputeID).getVotesLengths()[newRoundIndex];

  createRound(disputeID, newRoundIndex.toString(), jurySize, event.params._arbitrable);

  disputeEntity.period = getPeriodName(0);
  disputeEntity.save();
}

export function handleAppealPossible(event: AppealPossible): void {
  const disputeID = event.params._disputeID;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  const lastRoundIndex = getLastRoundIndex(disputeID);
  const roundID = `${disputeID.toString()}-${lastRoundIndex}`;
  const roundEntity = RoundEntity.load(roundID);
  if (!roundEntity) return;

  const truthPost = TruthPost.bind(event.params._arbitrable);
  const basicCost = truthPost.appealFee(disputeID);

  const WINNER_MULTIPLIER = truthPost.WINNER_STAKE_MULTIPLIER();
  const LOSER_MULTIPLIER = truthPost.LOSER_STAKE_MULTIPLIER();
  const MULTIPLIER_DENOMINATOR = truthPost.MULTIPLIER_DENOMINATOR();

  const lastRoundWinner = truthPost.getLastRoundWinner(disputeID).toI32();
  const loserTotalCost = basicCost.plus(basicCost.times(LOSER_MULTIPLIER).div(MULTIPLIER_DENOMINATOR));
  const winnerTotalCost = basicCost.plus(basicCost.times(WINNER_MULTIPLIER).div(MULTIPLIER_DENOMINATOR));

  const rulingOptionLength = truthPost
    .NUMBER_OF_RULING_OPTIONS()
    .plus(ONE)
    .toI32();
  const totalCost = new Array<BigInt>(rulingOptionLength).fill(loserTotalCost);
  totalCost[lastRoundWinner] = winnerTotalCost;
  roundEntity.totalToBeRaised = totalCost;

  roundEntity.save();
}

export function handleNewPeriod(event: NewPeriod): void {
  const disputeID = event.params._disputeID;
  let dispute = DisputeEntity.load(disputeID.toString());
  if (!dispute) return;

  const klerosLiquid = KlerosLiquid.bind(event.address);
  dispute.ruling = klerosLiquid.currentRuling(disputeID);
  dispute.period = getPeriodName(event.params._period);
  dispute.lastPeriodChange = event.block.timestamp;

  if (dispute.period === "appeal") {
    const aribtrated = klerosLiquid.disputes(disputeID).getArbitrated();
    updateRoundAppealDeadline(disputeID, aribtrated);
  }
  dispute.save();
}

export function handleNewPhase(event: NewPhase): void {
  const arbitratorEntity = ArbitratorEntity.load(event.address.toHexString());
  if (!arbitratorEntity) return;

  const contract = KlerosLiquid.bind(event.address);

  arbitratorEntity.phase = getPhaseName(event.params._phase);
  arbitratorEntity.lastPhaseChange = event.block.timestamp;
  arbitratorEntity.minStakingTime = contract.minStakingTime();
  arbitratorEntity.save();
}

export function handleStakeSet(event: StakeSet): void {
  const arbitratorEntity = ArbitratorEntity.load(event.address.toHexString());
  if (!arbitratorEntity) return;

  const contract = KlerosLiquid.bind(event.address);
  arbitratorEntity.nextDelayedSetStake = contract.nextDelayedSetStake(); // TODO: check if valid
  arbitratorEntity.minStakingTime = contract.minStakingTime(); //TODO: check if valid

  arbitratorEntity.save();
}

export function handleExecuteDelayedSetStakes(call: ExecuteDelayedSetStakesCall): void {
  const contract = KlerosLiquid.bind(call.to);
  const arbitratorEntity = ArbitratorEntity.load(call.to.toString());

  if (!arbitratorEntity) return;
  const nextDelayedSetStake = contract.nextDelayedSetStake();
  const lastDelayedSetStake = contract.lastDelayedSetStake();

  const actualIterations =
    nextDelayedSetStake.plus(call.inputs._iterations) > lastDelayedSetStake ? lastDelayedSetStake.minus(nextDelayedSetStake) : call.inputs._iterations;

  arbitratorEntity.lastDelayedSetStake = nextDelayedSetStake.plus(actualIterations);
  arbitratorEntity.save();
}
