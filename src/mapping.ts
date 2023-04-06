import { ethereum, BigInt, log, Address } from "@graphprotocol/graph-ts";

import { PolicyUpdate } from "../generated/PolicyRegistry/PolicyRegistry";
import { AppealDecision, ExecuteDelayedSetStakesCall, KlerosLiquid, KlerosLiquid__appealPeriodResult, NewPeriod, NewPhase, StakeSet } from "../generated/KlerosLiquid/KlerosLiquid";
import {
  TruthPost,
  BalanceUpdate,
  Challenge,
  Contribution,
  Debunked,
  Dispute,
  Evidence,
  MetaEvidence,
  NewArticle,
  Ruling,
  RulingFunded,
  TimelockStarted,
  Withdrawal,
  ArticleWithdrawn
} from "../generated/TruthPost/TruthPost";

import {
  Article,
  ArticleStorage,
  EventEntity,
  ContributionEntity,
  MetaEvidenceEntity,
  DisputeEntity,
  CrowdfundingStatus,
  CourtEntity,
  RoundEntity,
  ArbitratorEntity,
} from "../generated/schema";

const TO_BE_SET_LATER = "To be set later";
const NUMBER_OF_RULING_OPTIONS = 2;

enum RulingOptions {
  Tied,
  ChallengeFailed,
  Debunked
}

/* export function calculateTotalContributions({ contributions }:User) {
  const amountsByUser= {};
  contributions.forEach(contributionID => {
    const userId = contribution.contributor.id
    if (!amountsByUser[userId]) {
      amountsByUser[userId] = BigInt(0)
    }
    amountsByUser[userId] += contribution.amount
  })
  return Object.values(amountsByUser)
} */

function createRound(_disputeID: BigInt, _roundIndex: string, _jurySize: BigInt, _arbitrableAddress: Address): void {
  const rulingOptionsLength = NUMBER_OF_RULING_OPTIONS + 1;
  const roundEntity = new RoundEntity(`${_disputeID.toString()}-${_roundIndex}`);

  roundEntity.dispute = _disputeID.toString();
  roundEntity.jurySize = _jurySize;
  roundEntity.appealDeadline = new Array<BigInt>(rulingOptionsLength).fill(BigInt.fromI32(0));
  roundEntity.raisedSoFar = new Array<BigInt>(rulingOptionsLength).fill(BigInt.fromI32(0));
  roundEntity.hasPaid = new Array<boolean>(rulingOptionsLength).fill(false);

  const contract = TruthPost.bind(_arbitrableAddress);
  const currentRuling = contract.getLastRoundWinner(_disputeID);

  let appealDeadlineArray = new Array<BigInt>(rulingOptionsLength).fill(BigInt.fromI32(0));
  if (currentRuling.toI32() !== RulingOptions.Tied) {
    const loserAppealPeriod = contract.getAppealPeriod(_disputeID, RulingOptions.ChallengeFailed);
    const winnerAppealPeriod = contract.getAppealPeriod(_disputeID, RulingOptions.Debunked);
    appealDeadlineArray[RulingOptions.ChallengeFailed] = loserAppealPeriod.value0.plus(loserAppealPeriod.value1);
    appealDeadlineArray[RulingOptions.Debunked] = winnerAppealPeriod.value0.plus(winnerAppealPeriod.value1);

    roundEntity.appealDeadline = appealDeadlineArray;
  }

  roundEntity.save();
}

function getPeriodName(index: i32): string {
  const periods = ["evidence", "commit", "vote", "appeal", "execution"];
  return periods.at(index) || "None";
}

function getPhaseName(index: i32): string {
  const phases = ["staking", "generating", "drawing"];
  return phases.at(index) || "None";
}

function getArticleEntityInstance(articleStorageAddress: BigInt): Article {
  let articleStorage = ArticleStorage.load(articleStorageAddress.toString());
  if (!articleStorage) {
    log.error("There is no article at storage address {}. However, this is impossible. There must be a bug within the subgraph.", [
      articleStorageAddress.toString()
    ]);
    throw new InternalError("There is no article at given storage address.");
  }

  let articleEntityID = articleStorage.articleEntityID;
  let article = Article.load(articleEntityID);

  if (!article) {
    log.error("There is no article entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [articleEntityID]);
    throw new InternalError("There is no article entity with given id.");
  }

  return article;
}

function getPopulatedEventEntity(
  event: ethereum.Event,
  name: string,
  articleID: string,
  details: string | null = null,
  from: Address | null = event.transaction.from
): EventEntity {
  let entity = new EventEntity(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  entity.name = name;
  entity.article = articleID;
  if (details) entity.details = details;
  if (from) entity.from = from;

  entity.timestamp = event.block.timestamp;

  return entity;
}

export function handleNewArticle(event: NewArticle): void {
  let articleStorage = new ArticleStorage(event.params.articleAddress.toString());

  articleStorage.articleEntityID = event.params.articleAddress.toString() + "-" + event.block.number.toString();
  articleStorage.save();

  let article = new Article(articleStorage.articleEntityID);
  article.articleID = event.params.articleID.toString();
  article.owner = event.transaction.from;
  article.category = event.params.category;
  article.status = "Live";
  article.bounty = BigInt.fromI32(0);
  article.withdrawalPermittedAt = BigInt.fromI32(0);
  article.lastBalanceUpdate = event.block.number;
  article.createdAtBlock = event.block.number;
  article.createdAtTimestamp = event.block.timestamp;
  article.lastCalculatedScore = BigInt.fromI32(0);

  let contract = TruthPost.bind(event.address);
  const ARBITRATOR_CONTRACT_ADDRESS = contract.ARBITRATOR();
  const ARBITRATOR_EXTRA_DATA = contract.categoryToArbitratorExtraData(BigInt.fromI32(event.params.category));
  article.arbitrator = ARBITRATOR_CONTRACT_ADDRESS.toHexString();
  article.arbitratorExtraData = ARBITRATOR_EXTRA_DATA;

  const arbitratorContract = KlerosLiquid.bind(ARBITRATOR_CONTRACT_ADDRESS);
  let arbitratorEntity = ArbitratorEntity.load(ARBITRATOR_CONTRACT_ADDRESS.toHexString());
  if (!arbitratorEntity) {
    arbitratorEntity = new ArbitratorEntity(ARBITRATOR_CONTRACT_ADDRESS.toHexString());
  }

  arbitratorEntity.minStakingTime = arbitratorContract.minStakingTime();
  arbitratorEntity.nextDelayedSetStake = arbitratorContract.nextDelayedSetStake();
  arbitratorEntity.lastDelayedSetStake = arbitratorContract.lastDelayedSetStake();
  arbitratorEntity.phase = getPhaseName(arbitratorContract.phase());
  arbitratorEntity.lastPhaseChange = arbitratorContract.lastPhaseChange();
  arbitratorEntity.save();
  article.save();

  getPopulatedEventEntity(event, "NewArticle", article.id, event.params.category.toString()).save();
}

export function handleBalanceUpdate(event: BalanceUpdate): void {
  let article = getArticleEntityInstance(event.params.articleAddress);

  let newScore = event.block.number
    .minus(article.lastBalanceUpdate)
    .times(article.bounty)
    .plus(article.lastCalculatedScore);

  article.lastCalculatedScore = newScore;
  article.lastBalanceUpdate = event.block.number;
  article.status = "Live";
  article.bounty = event.params.newTotal;
  article.save();

  getPopulatedEventEntity(event, "BalanceUpdate", article.id, event.params.newTotal.toString()).save();
}

export function handleChallenge(event: Challenge): void {
  const contract = TruthPost.bind(event.address);
  const arbitratorAddress = contract.ARBITRATOR();

  const arbitrator = KlerosLiquid.bind(arbitratorAddress);
  const courtID = arbitrator.disputes(event.params.disputeID).getSubcourtID(); // TODO: OBTAIN SUBCOURTID FROM ARBITRATOR_EXTRA_DATA

  const courtEntity = new CourtEntity(courtID.toString());

  courtEntity.timesPerPeriod = arbitrator.getSubcourt(courtID).getTimesPerPeriod();
  courtEntity.hiddenVotes = arbitrator.courts(courtID).getHiddenVotes();

  let article = getArticleEntityInstance(event.params.articleAddress);

  article.status = "Challenged";
  article.challenger = event.transaction.from;
  article.save();

  getPopulatedEventEntity(event, "Challenge", article.id).save();

  const disputeID = event.params.disputeID;
  let disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) {
    disputeEntity = new DisputeEntity(disputeID.toString());
  }

  disputeEntity.period = getPeriodName(0);
  disputeEntity.lastPeriodChange = event.block.timestamp;
  disputeEntity.court = courtEntity.id;
  disputeEntity.article = article.id;

  const roundIndex = BigInt.fromI32(0);
  const jurySize = arbitrator.getDispute(disputeID).getVotesLengths()[roundIndex.toI32()];
  createRound(disputeID, roundIndex.toString(), jurySize, event.address);

  courtEntity.save();
  disputeEntity.save();
}

export function handleDispute(event: Dispute): void {
  /* xczcxzc */
}

export function handleDebunked(event: Debunked): void {
  let article = getArticleEntityInstance(event.params.articleAddress);

  article.status = "Debunked";
  article.bounty = BigInt.fromI32(0);
  article.lastBalanceUpdate = event.block.number;
  article.lastCalculatedScore = BigInt.fromI32(0);

  article.save();

  getPopulatedEventEntity(event, "Debunked", article.id).save();
}

export function handleTimelockStarted(event: TimelockStarted): void {
  let article = getArticleEntityInstance(event.params.articleAddress);

  let contract = TruthPost.bind(event.address);

  const ARTICLE_WITHDRAWAL_TIMELOCK = contract.ARTICLE_WITHDRAWAL_TIMELOCK();
  let withdrawalPermittedAt = ARTICLE_WITHDRAWAL_TIMELOCK.plus(event.block.timestamp);

  article.status = "TimelockStarted";
  article.withdrawalPermittedAt = withdrawalPermittedAt;

  let newScore = event.block.number
    .minus(article.lastBalanceUpdate)
    .times(article.bounty)
    .plus(article.lastCalculatedScore);
  article.lastCalculatedScore = newScore;
  article.lastBalanceUpdate = event.block.number;

  article.save();

  getPopulatedEventEntity(event, "TimelockStarted", article.id, withdrawalPermittedAt.toString()).save();
}

export function handleArticleWithdrawal(event: ArticleWithdrawn): void {
  let article = getArticleEntityInstance(event.params.articleAddress);

  article.status = "Withdrawn";
  article.bounty = BigInt.fromI32(0);
  article.lastBalanceUpdate = event.block.number;

  article.save();

  getPopulatedEventEntity(event, "ArticleWithdrawal", article.id, article.lastCalculatedScore.toString()).save();
}

export function handleEvidence(event: Evidence): void {
  const disputeEntity = DisputeEntity.load(event.params._evidenceGroupID.toString());
  if(!disputeEntity) return;

  getPopulatedEventEntity(event, "Evidence", disputeEntity.article, event.params._evidence).save();
}

export function handleContribution(event: Contribution): void {
  let article = getArticleEntityInstance(event.params.disputeId);

  getPopulatedEventEntity(event, "ClaimWithdrawal", article.id, event.transaction.value.toString()).save();

  const disputeID = event.params.disputeId;

  const lastRoundIndex = event.params.round;
  const roundID = `${disputeID.toString()}-${lastRoundIndex.toString()}`;
  const roundEntity = RoundEntity.load(roundID);
  if (!roundEntity) return;

  const truthPost = TruthPost.bind(event.address);
  const roundInfo = truthPost.getRoundInfo(disputeID, lastRoundIndex);

  roundEntity.raisedSoFar[event.params.ruling] = roundInfo.getTotalPerRuling()[event.params.ruling];
  roundEntity.save();
  const contributionEntityID =
    disputeID.toString() + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) contributionEntity = new ContributionEntity(contributionEntityID);

  contributionEntity.amount = contributionEntity.amount.plus(event.params.amount);
  //contributionEntity.contributor = event.params.contributor.toString();
  contributionEntity.save();
}

export function handleMetaEvidence(event: MetaEvidence): void {
  const metaEvidenceEntity = new MetaEvidenceEntity(event.params._metaEvidenceID.toString());
  metaEvidenceEntity.uri = event.params._evidence;

  metaEvidenceEntity.save();
}

export function handleWithdrawal(event: Withdrawal): void {
  let article = getArticleEntityInstance(event.params.disputeId);

  getPopulatedEventEntity(event, "Withdrawal", article.id).save();

  let disputes = article.disputes;
  let lastIndex = disputes ? disputes.length - 1 : 0;
  let lastDisputeId = disputes ? disputes[lastIndex] : BigInt.fromI32(0).toString();

  const contributionEntityID =
    lastDisputeId + "-" + event.params.round.toString() + "-" + event.params.contributor.toString() + "-" + event.params.ruling.toString();

  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) {
    log.error("There is no contribution entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [contributionEntityID]);
    return;
  }

  contributionEntity.save();
}

export function handleRuling(event: Ruling): void {
  const disputeEntity = DisputeEntity.load(event.params._disputeID.toString());

  if (!disputeEntity) {
    log.error("There is no dispute with id {}. However, this is impossible. There must be a bug within the subgraph.", [event.params._disputeID.toString()]);
    return;
  }

  let article = getArticleEntityInstance(BigInt.fromString(disputeEntity.article.split("-")[0]));

  disputeEntity.ruled = true;
  disputeEntity.save();

  if (event.params._ruling.equals(BigInt.fromI32(2))) {
    article.status = "Debunked";
  } else {
    article.status = "Live";
  }

  article.save();

  getPopulatedEventEntity(event, "Ruling", article.id, event.params._ruling.toString(), event.params._arbitrator).save();
}

export function handleRulingFunded(event: RulingFunded): void {
  let article = getArticleEntityInstance(event.params.disputeId);

  getPopulatedEventEntity(event, "RulingFunded", article.id, event.params.ruling.toString()).save();

  const disputeID = event.params.disputeId;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  const lastRoundIndex = event.params.round;
  const lastRoundID = `${disputeID.toString()}-${lastRoundIndex.toString()}`;
  const roundEntity = RoundEntity.load(lastRoundID);

  if (!roundEntity) return;
  roundEntity.hasPaid[event.params.ruling] = true;

  /* if (roundEntity.hasPaid[RulingOptions.ChallengeFailed] && roundEntity.hasPaid[RulingOptions.Debunked]) {
    const arbitrator = KlerosLiquid.bind(Address.fromHexString(article.arbitrator));
    const jurySize = arbitrator.getDispute(disputeID).getVotesLengths()[lastRoundIndex.toI32()]; // TODO: check if it set correctly. If not move it into handleAppealDecision

    const nextRoundIndex = lastRoundIndex.plus(BigInt.fromI32(1)).toString();
    createRound(disputeID, nextRoundIndex, jurySize, event);
  } */
  roundEntity.save();
}

export function handleAppealDecision(event: AppealDecision): void {
  const truthPost = TruthPost.bind(event.params._arbitrable);
  if (!truthPost) return; // Filter out other IArbitrable contracts

  const disputeID = event.params._disputeID;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  const newRoundIndex = disputeEntity.rounds.length;

  const arbitrator = KlerosLiquid.bind(event.address);
  const jurySize = arbitrator.getDispute(disputeID).getVotesLengths()[newRoundIndex];

  const roundInfo = truthPost.getRoundInfo(disputeID, BigInt.fromI32(newRoundIndex));
  createRound(disputeID, newRoundIndex.toString(), jurySize, event.params._arbitrable);
}

export function handleNewPeriod(event: NewPeriod): void {
  let dispute = DisputeEntity.load(event.params._disputeID.toString());
  if (!dispute) return;

  dispute.ruling = KlerosLiquid.bind(event.address).currentRuling(event.params._disputeID);
  dispute.period = getPeriodName(event.params._period);
  dispute.lastPeriodChange = event.block.timestamp;

  dispute.save();
}

export function handleNewPhase(event: NewPhase): void {
  const arbitratorEntity = ArbitratorEntity.load(event.address.toHexString());
  if(!arbitratorEntity) return;

  const contract = KlerosLiquid.bind(event.address);

  arbitratorEntity.phase = getPhaseName(event.params._phase);
  arbitratorEntity.lastPhaseChange = event.block.timestamp;
  arbitratorEntity.minStakingTime = contract.minStakingTime();
  arbitratorEntity.save();
}

export function handleStakeSet(event: StakeSet): void {
  const arbitratorEntity = ArbitratorEntity.load(event.address.toHexString());
  if(!arbitratorEntity) return;

  const contract = KlerosLiquid.bind(event.address);
  arbitratorEntity.nextDelayedSetStake = contract.nextDelayedSetStake(); // TODO: check if valid
  arbitratorEntity.minStakingTime = contract.minStakingTime(); //TODO: check if valid

  arbitratorEntity.save();
}

export function handleExecuteDelayedSetStakes(call: ExecuteDelayedSetStakesCall):void{
  const contract = KlerosLiquid.bind(call.to);
  const arbitratorEntity = ArbitratorEntity.load(call.to.toString());

  if(!arbitratorEntity) return;
  const nextDelayedSetStake = contract.nextDelayedSetStake();
  const lastDelayedSetStake = contract.lastDelayedSetStake();
  
  const actualIterations = nextDelayedSetStake.plus(call.inputs._iterations) > lastDelayedSetStake 
    ? lastDelayedSetStake.minus(nextDelayedSetStake)
    : call.inputs._iterations;

  arbitratorEntity.lastDelayedSetStake = nextDelayedSetStake.plus(actualIterations);
  arbitratorEntity.save();
}

export function handlePolicyUpdate(event: PolicyUpdate): void {
  let court = CourtEntity.load(event.params._subcourtID.toString());
  if (!court) {
    court = new CourtEntity(event.params._subcourtID.toString());
  }
  court.policyURI = event.params._policy;
  court.hiddenVotes = false;
  court.timesPerPeriod = [BigInt.fromI32(0)];
  court.save();
}
