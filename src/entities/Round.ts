import { Address, BigInt } from "@graphprotocol/graph-ts";
import { RoundEntity } from "../../generated/schema";
import { TruthPost } from "../../generated/TruthPost/TruthPost";
import { dataSource } from "@graphprotocol/graph-ts";

const NUMBER_OF_RULING_OPTIONS = 2;
enum RulingOptions {
  Tied,
  ChallengeFailed,
  Debunked
}

const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);

export function createRound(_disputeID: BigInt, _roundIndex: string, _jurySize: BigInt, _arbitrableAddress: Address): void {
  const rulingOptionsLength = NUMBER_OF_RULING_OPTIONS + 1;
  const roundEntity = new RoundEntity(`${_disputeID.toString()}-${_roundIndex}`);

  roundEntity.dispute = _disputeID.toString();
  roundEntity.jurySize = _jurySize;
  roundEntity.votesPerChoice = new Array<BigInt>(rulingOptionsLength).fill(ZERO);
  roundEntity.appealDeadline = new Array<BigInt>(rulingOptionsLength).fill(ZERO);
  roundEntity.raisedSoFar = new Array<BigInt>(rulingOptionsLength).fill(ZERO);
  roundEntity.totalToBeRaised = new Array<BigInt>(rulingOptionsLength).fill(ZERO);
  roundEntity.hasPaid = new Array<boolean>(rulingOptionsLength).fill(false);

  const contract = TruthPost.bind(_arbitrableAddress);
  const basicCost = contract.appealFee(_disputeID);

  const WINNER_MULTIPLIER = contract.WINNER_STAKE_MULTIPLIER();
  const LOSER_MULTIPLIER = contract.LOSER_STAKE_MULTIPLIER();
  const MULTIPLIER_DENOMINATOR = contract.MULTIPLIER_DENOMINATOR();

  const totalCost = new Array<BigInt>(rulingOptionsLength).fill(ZERO);
  totalCost[RulingOptions.Debunked] = basicCost.plus(basicCost.plus(WINNER_MULTIPLIER).div(MULTIPLIER_DENOMINATOR));
  totalCost[RulingOptions.ChallengeFailed] = basicCost.plus(basicCost.plus(LOSER_MULTIPLIER).div(MULTIPLIER_DENOMINATOR));
  roundEntity.totalToBeRaised = totalCost;

  roundEntity.save();
}

export function getLastRoundIndex(disputeID: BigInt): BigInt {
  let lastRoundIndex = ZERO;
  let roundID = disputeID.toString() + "-" + lastRoundIndex.toString();

  if (RoundEntity.load(roundID) == null) return ZERO;

  while (RoundEntity.load(roundID) !== null) {
    lastRoundIndex = lastRoundIndex.plus(ONE);
    roundID = disputeID.toString() + "-" + lastRoundIndex.toString();
  }
  return lastRoundIndex.minus(ONE);
}

export function updateRoundAppealDeadline(_disputeID: BigInt, _arbitrable: Address): void {
  const lastRoundIndex = getLastRoundIndex(_disputeID);

  const roundEntity = RoundEntity.load(`${_disputeID}-${lastRoundIndex}`);
  if (!roundEntity) return;

  const contract = TruthPost.bind(_arbitrable);
  const rulingOptionsLength = contract
    .NUMBER_OF_RULING_OPTIONS()
    .plus(ONE)
    .toI32();

  let appealDeadlineArray = new Array<BigInt>(rulingOptionsLength).fill(ZERO);

  appealDeadlineArray[RulingOptions.Tied] = contract.getAppealPeriod(_disputeID, RulingOptions.Tied).value1;
  appealDeadlineArray[RulingOptions.ChallengeFailed] = contract.getAppealPeriod(_disputeID, RulingOptions.ChallengeFailed).value1;
  appealDeadlineArray[RulingOptions.Debunked] = contract.getAppealPeriod(_disputeID, RulingOptions.Debunked).value1;
  roundEntity.appealDeadline = appealDeadlineArray;
  roundEntity.save();
}
