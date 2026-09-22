# Architecture

## Indexing

The subgraph indexes the Ethereum mainnet contracts used by `truthpost.news`.
`subgraph.yaml` defines the networks, contract addresses and history boundaries.
A network change must update addresses together with the network selection;
an address without code can silently produce an empty index.

TruthPost events create article and dispute entities. KlerosLiquid events and
calls update arbitration state for those disputes. Both sources begin at
TruthPost's creation. PolicyRegistry starts at its earliest policy events,
because courts already had policies before TruthPost existed. Starting that
source at TruthPost's creation would leave existing court policies unavailable.

Mappings persist entities in Graph Node's store, exposed through `schema.graphql`.
Court policy updates are replayed before later challenges populate the court's
timing and voting fields; saving those fields preserves the policy URI.
Arbitrator and arbitrable network fields retain the schema's Bytes representation
and contain the UTF-8 encoding of the manifest's network name.

## Deployment

The production target is The Graph Studio. The deployment workflow in
`.github/workflows/deploy.yml` runs after changes reach the default branch and
passes a Studio deploy key and a unique run version directly to the CLI.
The key is required to publish and is scoped to the deployment step. Earlier
dependency installation and build steps do not receive it.

A fresh index reconstructs state from each source's configured history boundary.
Restoring the website also requires the frontend's query URL to identify the
Studio subgraph that receives the deployment.
