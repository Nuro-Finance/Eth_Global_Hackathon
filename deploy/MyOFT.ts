import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'

const contractName = 'MyOFT'

const deploy: DeployFunction = async (hre) => {
    const { getNamedAccounts, deployments } = hre

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    // If the oftAdapter configuration is defined on a network that is deploying an OFT,
    // the deployment will log a warning and skip the deployment
    if (hre.network.config.oftAdapter != null) {
        console.warn(`oftAdapter configuration found on OFT deployment, skipping OFT deployment`)
        return
    }

    // Resolve LayerZero V2 EndpointV2 address, falling back to the canonical
    // mainnet address if toolbox-hardhat returns an empty value (Node 23 bug)
    let endpointAddress: string
    try {
        const endpointV2Deployment = await hre.deployments.get('EndpointV2')
        if (!endpointV2Deployment.address) throw new Error('empty address')
        endpointAddress = endpointV2Deployment.address
    } catch {
        endpointAddress = '0x1a44076050125825900e736c501f859c50fE728c'
        console.log(`EndpointV2 lookup failed, using hardcoded address: ${endpointAddress}`)
    }

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [
            'USD Coin', // name
            'USDC',     // symbol
            endpointAddress, // LayerZero's EndpointV2 address
            deployer,   // owner
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${contractName}, network: ${hre.network.name}, address: ${address}`)
}

deploy.tags = [contractName]

export default deploy