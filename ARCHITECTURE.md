# Architecture

One dated entry per architectural decision: what was decided, what was weighed
against it, and what the decision costs. Implementation choices, refactors and
dependency bumps do not belong here.

## 2026-09-09: index the Ethereum mainnet deployment, not Goerli

**Decision.** All three data sources (`TruthPost`, `PolicyRegistry`,
`KlerosLiquid`) index Ethereum mainnet from block 17422376, the creation block
of `0x87AAdE1067Ed0276ec9BEf6db8E17Abe27A6B454`. The subgraph is published to
The Graph Studio.

Until now this repository described the Goerli deployment. The mainnet subgraph
that `truthpost.news` actually queries was deployed from configuration that was
never committed, so the repository stopped being the source of truth for what
runs. When that Studio deployment disappeared, nothing here could rebuild it.

**Alternatives weighed.**

- *Keep indexing Goerli.* Rejected: the network was shut down in 2023, so the
  manifest describes a chain that no longer answers.
- *Index both networks, as parallel data sources or as two subgraphs.* Rejected:
  there is no live testnet deployment to index, and carrying a second network
  doubles the surface that drifts out of sync, which is the failure this entry
  exists to correct.
- *Redeploy the contracts on a current testnet and index that.* Rejected as a
  different project: it would not restore the live site, which is the reason for
  the change.

**Consequences accepted.**

- The hosted service was sunset in June 2024, so Studio is the only publishing
  target and a Studio deploy key is required to release. There is no anonymous
  path to a working index.
- Indexing from June 2023 means a full resync on every fresh deploy.
- Goerli history is no longer available through this subgraph. Nothing depends
  on it.
- The Kleros addresses are now mainnet-specific. The previous Goerli addresses
  hold no code on mainnet, so a future network change that edits only the
  `network:` field will index nothing and report no error. Network and addresses
  must move together.
