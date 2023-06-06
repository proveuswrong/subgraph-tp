import { ethereum, BigInt, log, Address } from "@graphprotocol/graph-ts";
import { dataSource } from "@graphprotocol/graph-ts";
import { KlerosLiquid } from "../generated/KlerosLiquid/KlerosLiquid";
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
  CourtEntity,
  RoundEntity,
  ArbitratorEntity,
  User,
  RewardEntity,
  ArbitrableEntity
} from "../generated/schema";
import { createRound } from "./entities/Round";
import { getPeriodName, getPhaseName } from "./utils";

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
  courtEntity.save();

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
  disputeEntity.contributors = new Array<string>();

  const roundIndex = BigInt.fromI32(0);
  const jurySize = arbitrator.getDispute(disputeID).getVotesLengths()[roundIndex.toI32()];
  createRound(disputeID, roundIndex.toString(), jurySize, event.address);

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
  if (!disputeEntity) return;

  getPopulatedEventEntity(event, "Evidence", disputeEntity.article, event.params._evidence).save();
}

export function handleContribution(event: Contribution): void {
  // let x: string[] = [];

  const disputeID = event.params.disputeId;
  let disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  let article = getArticleEntityInstance(BigInt.fromString(disputeEntity.article.split("-")[0]));
  const rawMessage = `${event.params.ruling}-${event.params.amount}-${event.params.contributor.toHexString()}`;
  getPopulatedEventEntity(event, "Contribution", article.id, rawMessage).save();

  const contributorsArray = disputeEntity.contributors;
  const lastIndex = disputeEntity.contributors.length;
  contributorsArray[lastIndex] = event.params.contributor.toHexString();
  disputeEntity.contributors = contributorsArray;

  log.warning("Current contributors array length {}", [lastIndex.toString()]);
  disputeEntity.save();

  const lastRoundIndex = event.params.round;
  const roundID = `${disputeID.toString()}-${lastRoundIndex.toString()}`;
  const roundEntity = RoundEntity.load(roundID);
  if (!roundEntity) return;

  const truthPost = TruthPost.bind(event.address);
  const roundInfo = truthPost.getRoundInfo(disputeID, lastRoundIndex);

  roundEntity.raisedSoFar = roundInfo.getTotalPerRuling();
  roundEntity.save();

  // Create or update the ContributionEntity
  const contributionEntityID = `${disputeID}-${lastRoundIndex}-${event.params.contributor.toHexString()}-${event.params.ruling}`;
  let contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) {
    contributionEntity = new ContributionEntity(contributionEntityID);
    contributionEntity.amount = event.params.amount;
    contributionEntity.contributor = event.params.contributor.toHexString();
  } else {
    contributionEntity.amount = event.params.amount.plus(contributionEntity.amount);
  }
  contributionEntity.save();

  // Create or update the User entity
  const userID = event.params.contributor.toHexString();
  let userEntity = User.load(userID);
  if (!userEntity) {
    userEntity = new User(userID);
    userEntity.id = event.params.contributor.toHexString();
  }
  userEntity.save();

  const rewardID = `${disputeID}-${event.params.contributor.toHexString()}`;
  let rewardEntity = RewardEntity.load(rewardID);
  if (!rewardEntity) {
    rewardEntity = new RewardEntity(rewardID);
    rewardEntity.totalWithdrawableAmount = BigInt.fromI32(0);
    rewardEntity.withdrew = false;
    rewardEntity.beneficiary = event.params.contributor.toHexString();
  }
  rewardEntity.save();
}

export function handleMetaEvidence(event: MetaEvidence): void {
  const metaEvidenceEntity = new MetaEvidenceEntity(event.params._metaEvidenceID.toString());
  metaEvidenceEntity.uri = event.params._evidence;

  metaEvidenceEntity.save();

  const arbitrableEntity = new ArbitrableEntity(BigInt.fromI32(0).toString());
  arbitrableEntity.address = dataSource.address();
  arbitrableEntity.network = Address.fromHexString(dataSource.network());
  arbitrableEntity.save();
}

export function handleWithdrawal(event: Withdrawal): void {
  const disputeID = event.params.disputeId;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;

  let article = getArticleEntityInstance(BigInt.fromString(disputeEntity.article.split("-")[0]));

  getPopulatedEventEntity(event, "Withdrawal", article.id).save();

  const contributionEntityID = `${disputeID}-${event.params.round}-${event.params.contributor.toHexString()}-${event.params.ruling}`;
  const contributionEntity = ContributionEntity.load(contributionEntityID);
  if (!contributionEntity) {
    log.error("There is no contribution entity with id {}. However, this is impossible. There must be a bug within the subgraph.", [contributionEntityID]);
    return;
  }
  contributionEntity.amount = BigInt.fromI32(0);
  contributionEntity.save();

  const truthPost = TruthPost.bind(event.address);

  const rewardID = `${disputeID}-${event.params.contributor.toHexString()}`;
  const rewardEntity = RewardEntity.load(rewardID);
  if (!rewardEntity) return;

  rewardEntity.totalWithdrawableAmount = truthPost.getTotalWithdrawableAmount(disputeID, event.params.contributor).getSum();
  if (rewardEntity.totalWithdrawableAmount.equals(BigInt.fromI32(0))) rewardEntity.withdrew = true;
  rewardEntity.save();
}

export function handleRuling(event: Ruling): void {
  const disputeID = event.params._disputeID;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) {
    log.error("There is no dispute with id {}. However, this is impossible. There must be a bug within the subgraph.", [event.params._disputeID.toString()]);
    return;
  }

  const contributors = disputeEntity.contributors;
  const truthPost = TruthPost.bind(event.address);

  const contributorsSet = new Set<string>();
  for (let i = 0; i < contributors.length; i++) {
    if (contributorsSet.has(contributors[i])) {
      continue;
    }
    contributorsSet.add(contributors[i]);
    const rewardEntity = RewardEntity.load(`${disputeID}-${contributors[i]}`);

    if (rewardEntity) {
      rewardEntity.totalWithdrawableAmount = rewardEntity.totalWithdrawableAmount.plus(
        truthPost.getTotalWithdrawableAmount(disputeID, Address.fromString(contributors[i])).getSum()
      );
      rewardEntity.save();
    }
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
  const disputeID = event.params.disputeId;
  const disputeEntity = DisputeEntity.load(disputeID.toString());
  if (!disputeEntity) return;
  let article = getArticleEntityInstance(BigInt.fromString(disputeEntity.article.split("-")[0]));

  getPopulatedEventEntity(event, "RulingFunded", article.id, event.params.ruling.toString()).save();

  const lastRoundIndex = event.params.round;
  const lastRoundID = `${disputeID.toString()}-${lastRoundIndex.toString()}`;
  const roundEntity = RoundEntity.load(lastRoundID);

  if (!roundEntity) return;
  const hasPaidArray = roundEntity.hasPaid;
  hasPaidArray[event.params.ruling] = true;
  roundEntity.hasPaid = hasPaidArray;

  roundEntity.save();
}
