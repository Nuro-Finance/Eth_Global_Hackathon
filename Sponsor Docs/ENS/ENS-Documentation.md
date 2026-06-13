# ENS 

NEW 

Skip to content
Hacking at ETHGlobal New York? Read the ENSv2 docs preview.


Logo
Intro
Using ENS
Quickstart
Getting Started
Tools and Libraries
ENSv2 Readiness
Web & Querying
Addresses
Text Records
Avatars
Primary Names
Listing Names
Advanced
Decentralized Web
Issuing Subdomains
Naming Smart Contracts
Layer 2's & Multichain
Subgraph
Design
Thorin
Brand
Smart Contracts
Governance
Improvement Proposals


Search...
Logo
Subdomains
We believe that any place an address is used, a name should be able to be used instead. The smart contracts you interact with have names, the deposit address for your favorite exchange has a name, your favorite DAO has a name, or maybe you use subnames to keep your wallets organized.

root
registrar
controller
resolver
registry
.ens.eth
Luckily, the ENS Protocol has so much to offer for you to play with. There are a variety of ways you can give out subdomains to your apps users, set them up for yourself, or more.

If you are interested in naming smart contracts specifically, check out the Naming Smart Contracts page.

Different Types of Subnames
ENS subnames come in a variety of forms: L1, L2, and offchain. From a technical perspective, L2 and offchain subnames are quite similar, but there are some tradeoffs to consider when choosing which one to use.

L1 Subnames
If you own a .eth name like nick.eth and go to create a subname in the manager app, you will be creating a subname on Ethereum Mainnet (L1) by default. This is the simplest way to create a subname with the least amount of moving pieces, but ultimately you are limited by the gas fees of Ethereum Mainnet.

If you'd like to issue L1 subnames to your users, read our guide on creating an onchain subname registrar.

Creating an Onchain Subname Registrar
Issue NFTs that represent subdomains on Ethereum Mainnet.
L2 Subnames
Developers can connect an ENS name on L1 with their own smart contracts on any L2 network, and depending on the implementation, this could be fully trustless while significantly reducing the cost of issuing subnames.

Durin is an opinionated approach to issuing ENS subnames on L2. It takes care of the L1 Resolver and offchain gateway parts of the CCIP Read stack for you, so you can focus on the business logic of your L2 smart contracts.

Durin
An opinionated approach to issuing ENS subnames on L2.
Offchain Subnames
Offchain subnames are exactly what they sound like - subnames that live in a centralized database on private servers, also powered by CCIP Read. If your goal is to name a large amount of EVM addresses quickly and cheaply, with a low barrier to entry, offchain subnames might be for you. Often times, managing offchain names is as simple as interacting with a REST API.

From a user perspective, offchain subnames are hardly different than onchain subnames. They will not appear in wallet applications as NFTs like the previous two approaches, but they can resolve all the same data (addresses, text records, etc).

There are multiple API providers that offer programmatic access to offchain subnames such as NameStone, Namespace and JustaName, along with open-source examples like gskril/ens-offchain-registrar.

Edit on Github
Last updated: 6/12/26, 3:18 PM
Decentralized Web
Previous
shift
←
Naming Smart Contracts
Next
shift
→
Did you find this page useful?
Yes
No


Forging Commmunity Identity
NameStone
Docs
Blog
Admin Login
Mainnet
Sepolia

Copy for LLMs
Introduction
SDK Quickstart
API
Set Name
Set Names
Get Names
Search Names
Delete Name
Set Domain
Get Domain
Enable Domain
Get SIWE Message
Admin Panel
Gasless DNS
Set Name
This POST route creates a name (subdomain) for a given address and domain. If the name already exists, it will be overwritten. If it doesn’t, this route will create it.
Parameters
Parameter	Type	Required	Description
name	string	Yes	The name being set, i.e., the "example" in example.testbrand.eth.
domain	string	Yes	The domain (e.g. "testbrand.eth").
address	string	No	The Ethereum address the name points to.
contenthash	string	No	The link for an IPFS or IPNS website.
text_records	object	No	An object containing key-value pairs of the text records to be set.
coin_types	object	No	An object containing key-value pairs of L2 chains and their resolved address.
Multichain Address Resolution
Namestone supports address resolution on any L2 Chains Supported by ENS.
To add an address to an L2 chain use its coin_type. (See coin_type column in the above link) .
Or convert chain_id to coin_type using the following typescript template.
Curl Example with coin_types
curl -X POST \
     -H 'Content-Type: application/json' \
     -H 'Authorization: YOUR_API_KEY' \
     -d '{
          "domain": "namestone.xyz",
          "name": "multichain",
          "address": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
          "coin_types": {
            "2147483785": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
            "2147492101": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
            "2147525809": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
            "2147483658": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF"
          },
          "text_records": {
            "com.twitter": "namestonehq",
            "com.github": "resolverworks",
            "url": "https://www.namestone.xyz",
            "description": "Multichain Example",
            "avatar": "https://imagedelivery.net/UJ5oN2ajUBrk2SVxlns2Aw/e52988ee-9840-48a2-d8d9-8a92594ab200/public"
          }
        }' \
     https://namestone.com/api/public_v1/set-name
SDK Example with coin_types
import NameStone, { AuthenticationError, NetworkError, TextRecords, CoinTypes } from '@namestone/namestone-sdk';

// Initialize the NameStone instance
const ns = new NameStone(<YOUR_API_KEY_HERE>);

// Define the name parameters
const domain = "namestone.xyz;
const name = "multichain";
const address = "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF";

// Define the coin types
const coinTypes: CoinTypes = {
  "2147483785": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
  "2147492101": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
  "2147525809": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF",
  "2147483658": "0x534631Bcf33BDb069fB20A93d2fdb9e4D4dD42CF"
};

// Define the text records
const textRecords: TextRecords = {
  "com.twitter": "namestonehq",
  "com.github": "resolverworks",
  "url": "https://www.namestone.xyz",
  "description": "Multichain Example",
  "avatar": "https://imagedelivery.net/UJ5oN2ajUBrk2SVxlns2Aw/e52988ee-9840-48a2-d8d9-8a92594ab200/public"
};

// Use an immediately invoked async function to allow top-level await
(async () => {
  try {
    const response = await ns.setName({
      name:name,
      domain:domain,
      address:address,
      text_records:textRecords,
      coin_types:coinTypes
  });

    console.log("Name set successfully:", response);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error("Authentication failed:", error.message);
    } else if (error instanceof NetworkError) {
      console.error("Network error:", error.message);
    } else {
      console.error("An unexpected error occurred:", error);
    }
  }
})();
Live Example: See multichain.namestone.xyz on the ENS app.
Image
NameStone Docs


---
description: Learn about the Ethereum Name Service (ENS) protocol and how it enables decentralized naming on the Ethereum blockchain.
---

import { DNSGrid } from '../../components/DNSGrid'
import { EmbedLink } from '../../components/EmbedLink'
import { EnsProfile } from '../../components/EnsProfile'
import { Card } from '../../components/ui/Card'

# What is the Ethereum Name Service?

The Ethereum Name Service (ENS) is a distributed, open, and extensible naming system based on the Ethereum blockchain.

<Card className="flex flex-col items-center justify-center gap-2 sm:flex-row">
  <EnsProfile name="nick.eth" />
  <EnsProfile name="jefflau.eth" />
</Card>

ENS maps human-readable names like 'alice.eth' to machine-readable identifiers such as Ethereum addresses, other cryptocurrency addresses, content hashes, metadata, and more.
ENS also supports 'reverse resolution', making it possible to associate metadata such as primary names or interface descriptions with Ethereum addresses.

Top-Level Domains (TLDs), like `.eth` and `.test`, are owned by smart contracts called [registrars](/registry/eth), which specify rules governing the allocation of their names.
Enabling seamless interoperability with the DNS (Domain Name System).

## ETH Registrar

The [ETH Registrar](/registry/eth) is the registrar for the `.eth` TLD, it allows for trustless decentralized names to be issued as tokens on the Ethereum Blockchain.
Registration is done through smart contracts, and name ownership is secured by the Ethereum blockchain.

## DNS + ENS

ENS has similar goals to DNS, the existing Internet's Domain Name Service, and aims to extend its capability.
ENS also supports importing DNS names through the use of DNSSEC.
Allowing you to take your `.com`, `.xyz`, or `.art` (and more) into the ENS ecosystem. Read more about DNSSEC names [on this page](/learn/dns).

<DNSGrid />

## Subnames

<Card className="flex items-center justify-center text-xl">
  <div className="text-right font-bold">
    {['root', 'registrar', 'controller', 'resolver', 'registry'].map(
      (subname, i) => (
        <div
          className={
            ['opacity-20', 'opacity-50', '', 'opacity-50', 'opacity-20'][i]
          }
          key={subname}
        >
          {subname}
        </div>
      )
    )}
  </div>
  <div className="text-blue font-bold">.ens.eth</div>
</Card>

Because of the hierarchical nature of ENS, anyone who owns a domain at any level can take control of resolution.
Users can create subdomains manually, or take matters into their own hands and write their own resolution logic.

For instance, if Alice owns 'alice.eth', she can create 'pay.alice.eth' and configure it as she wishes.
Or, use a [Custom Resolver](/resolvers/quickstart), and programmatically issue subdomains, for example in an App, Community, or DAO.

<EmbedLink
  href="/web/subdomains"
  title="Issuing Subdomains"
  description="Learn how to issue subdomains on ENS."
/>

## ENS Manager App

You can try ENS out for yourself now by using the [ENS Manager App](https://ens.app/), or by using any of the many ENS enabled applications on [our homepage](https://ens.domains/).

<EmbedLink
  href="https://ens.app"
  target="_blank"
  title="ENS Manager App"
  description="The ENS Manager App is a web-based interface for managing ENS names."
/>

---
description: Tools and resources for building ENS integrations with LLMs and AI assistants
---

# Building with AI

ENS provides tools and resources for developers building with large language models (LLMs) and AI assistants. Whether you're using AI to help write code, building agentic applications, or integrating ENS into AI-powered products, these resources will help.

## Plain Text Documentation

LLMs work best with plain text content that has fewer formatting tokens. ENS hosts machine-readable versions of this documentation following the emerging [llms.txt standard](https://llmstxt.org/).

| File                                                     | Description                                      |
| -------------------------------------------------------- | ------------------------------------------------ |
| [/llms.txt](https://docs.ens.domains/llms.txt)           | Concise overview of ENS documentation with links |
| [/llms-full.txt](https://docs.ens.domains/llms-full.txt) | Complete documentation in plain text format      |

You can provide these URLs to AI assistants or include them in your RAG (Retrieval-Augmented Generation) pipelines to give your AI tools up-to-date knowledge about ENS.

### Example Usage

When working with an AI assistant, you can reference these files directly:

```
Please read https://docs.ens.domains/llms.txt to learn about ENS,
then help me integrate ENS name resolution into my application.
```

## Context7 MCP

[Context7](https://context7.com) provides a Model Context Protocol (MCP) server that gives your AI coding assistant access to up-to-date ENS documentation. Once installed, you can simply ask your AI to use Context7 when working on ENS integrations.

### Installation

Install the Context7 MCP in your preferred AI coding tool:

:::code-group

```bash [Claude Code]
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

```json [Cursor (~/.cursor/mcp.json)]
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

```json [Windsurf]
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

:::

### Example Prompts

Once Context7 is connected, you can use prompts like:

```
Add ENS name resolution to this address input field. Use context7.
```

```
Show me how to fetch a user's avatar from their ENS name. Use context7 for ensdomains/docs.
```

```
Help me implement reverse resolution to show ENS names instead of addresses. Use context7.
```

The key is adding "use context7" to your prompt, which tells your AI assistant to fetch the latest ENS documentation before responding.

## AI Chat Assistant

Every page in this documentation includes an AI-powered chat assistant in the bottom right corner. Powered by [Cookbook](https://ai.cookbook.dev/), this assistant can:

- Answer questions about ENS concepts and implementation
- Help you navigate the documentation
- Provide code examples and explanations
- Assist with debugging ENS integrations

Click the chat icon in the bottom right corner of any page to get started.

## Community MCP Servers

The community has built additional MCP servers that may be useful for ENS and greater Ethereum ecosystem development:

- **[ETHID MCP](https://ethidentitykit.com/docs/ai-tools/ethid-mcp)** - Tools for working with ENS and EFP
- **[Ethereum MCP](https://github.com/gskril/ethereum-mcp)** - General-purpose EVM tools including ENS resolution, ABI parsing, and more
- **[ENS MCP by Namespace](https://github.com/thenamespace/ens-mcp)** - Lets AI agents query ENS names, subnames, ownership, profiles, pricing, availability, and history.

These are independently maintained by community members. Check their documentation for installation instructions and available features.

## Tips for AI-Assisted Development

When building ENS integrations with AI assistance:

1. **Use the full docs** - For comprehensive context, use `/llms-full.txt` in your prompts
2. **Specify your stack** - Mention which library you're using ([viem](https://viem.sh), [ethers.js](https://docs.ethers.org/), [ENSjs](https://github.com/ensdomains/ensjs)) for more relevant code examples
3. **Ensure ENSv2 readiness** - Point your AI to the [ENSv2 readiness guide](/web/ensv2-readiness) to make sure your integration is compatible

## Get Help

For human support, join the [ENS Developers Telegram group](https://t.me/+aLmF83si62ZhOGNh).

## See Also

- [Getting Started with ENS](/web) - Introduction to integrating ENS
- [Preparing for ENSv2](/web/ensv2-readiness) - Ensure your app works with ENSv2
- [Tools & Libraries](/web/libraries) - SDKs and libraries for ENS development

---
description: A method for verifying ENS names for AI agent registries
contributors:
- premm.eth
- raffy.eth
- workemon.eth
- ses.eth
ensip:
  created: "2025-10-02"
  status: draft
---

import { EnsipHeader } from "../../components/EnsipHeader";

# ENSIP-25: AI Agent Registry ENS Name Verification

<EnsipHeader authors={["premm.eth","raffy.eth","workemon.eth","ses.eth"]} created="October 2, 2025" status="draft" />

## Abstract

This ENSIP defines a standardized method for directly verifying, using text records, the association between an ENS name and an AI agent identity registered in a specific on-chain AI agent registry.

## Motivation

With the introduction of on-chain AI agent identity registries, such as ERC-8004, in which agents may declare an associated ENS name, there is a need for a standardized verification method. This verification process is essential for establishing trust between an AI agent identity and the ENS name it claims to control. This ENSIP defines a direct lookup method using a parameterized text record key that includes a unique agent identifier.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### Parameterized Verification Text Record Key

To enable verification of an ENS name from a specific AI agent registry entry, this ENSIP defines a global parameterized ENS text record key:

```
agent-registration[<registry>][<agentId>]
```

Where:

- `<registry>` is the ERC-7930 interoperable address of the registry contract (hexadecimal string with `0x` prefix),
- `<agentId>` is the registry-defined agent identifier (string) and MUST NOT contain the characters `[` or `]`.

The combination of `<registry>` and `<agentId>` MUST uniquely identify an agent within the context of the referenced registry.

The value of this text record MUST be a non-empty string. Implementations SHOULD set the value to `"1"`. The specific value has no semantic meaning; the presence of a non-empty value is interpreted as an attestation by the ENS name owner that the ENS name is associated with the referenced AI agent registry entry. Verification clients MUST NOT depend on the specific value beyond it being non-empty.

### Verification Flow (Registry-to-ENS)

Clients performing verification starting from an AI agent registry entry MUST follow the steps below:

1. Obtain the claimed ENS name, agent identifier, and registry address from the AI agent registry entry.
2. Construct the text record key `agent-registration[<registry>][<agentId>]`.
3. Resolve the text record with this key on the claimed ENS name.
4. If the resolved value is non-empty, the ENS name is considered verified for that specific agent registry entry.

If the text record does not exist or resolves to an empty value, verification MUST fail.

### Ethereum Example

For EVM-based registries, the registry address MUST be encoded as an ERC-7930 interoperable address with a 20-byte address length.

Example registry (ERC-8004 on Ethereum mainnet):

```
0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
```

ERC-7930 encoding (EIP-155 chain ID 1):

```
0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432
```

Corresponding verification text record key for agent `167`:

```
agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]
```

Any non-empty value set under this key indicates a positive verification.

### Registry Compatibility

This ENSIP is intended for AI agent registries that:

- assign stable identifiers to agent registrations, and
- allow an ENS name to be declared as part of the agent’s metadata (on-chain or off-chain).

Registries using this ENSIP MUST document how agent identifiers and claimed ENS names are obtained to allow clients to perform correct verification.

## Rationale

This ENSIP provides a minimal verification mechanism that leverages existing ENS text records without requiring resolver upgrades or registry-specific integrations. By embedding a registry entry identifier directly into the text record key, clients can perform deterministic verification from known registry inputs using a single resolver lookup.

The registry component is encoded as an ERC-7930 interoperable address, which combines chain identification and the registry contract address into a canonical representation, enabling unambiguous registry identification across chains.

## Backwards Compatibility

Not applicable.

## Security Considerations

If an ENS name is transferred to a new owner, any existing verification text records may become stale. Clients SHOULD consider ENS name ownership changes when evaluating the validity of prior attestations and MAY apply additional freshness or revocation checks as appropriate.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).