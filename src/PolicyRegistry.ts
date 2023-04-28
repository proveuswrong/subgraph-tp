import { BigInt } from "@graphprotocol/graph-ts";
import { PolicyUpdate } from "../generated/PolicyRegistry/PolicyRegistry";
import { CourtEntity } from "../generated/schema";

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
