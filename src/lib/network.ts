import { switchNetwork } from '@wagmi/core'
import { ethers } from 'ethers'
import { dev } from '$app/environment'
// import { goto } from '$app/navigation'
import { get as getStore } from 'svelte/store'

import { abi } from '$contracts/BlockPaperScissors.sol/BlockPaperScissors.json'
import { contractStore, networkStore, sessionStore } from '$src/stores'
import { CONTRACT_ADDRESS, VOTES_KEY_MAP, fetchGameState } from '$lib/contract'
// import { addNotification } from '$lib/notifications'

type PendingTX = {
  blockHeight: number
  choice: string
  // previousResult: string
  txHash: string
}

export type Network = {
  blockHeight: number
  activeChainId: string
  pendingTransaction: PendingTX
  pendingTransactions: PendingTX[]
}

export const APPROVED_CHAIN_IDS = {
  hyperspace: '0xc45'
}

export const TEAM_NETWORK_MAP = {
  // arbitrum: {
  //   wsProvider: 'wss://g.w.lavanet.xyz:443/gateway/arbn/rpc/654ffff52d55ada78b6e82ffda56ba65'
  // },
  ethereum: {
    mainnet: {
      chainId: '1',
      wsProvider:
        'wss://g.w.lavanet.xyz:443/gateway/eth/rpc/654ffff52d55ada78b6e82ffda56ba65'
    },
    testnet: {
      chainId: '5',
      contractAddress: '0x2367e429AD13fB0EaCE8d74F986296dA1501eaAC',
      wsProvider:
        'wss://g.w.lavanet.xyz:443/gateway/gth1/rpc/654ffff52d55ada78b6e82ffda56ba65'
    }
  },
  filecoin: {
    mainnet: {
      chainId: '314',
      wsProvider: 'wss://wss.node.glif.io/apigw/lotus/rpc/v1'
    },
    testnet: {
      chainId: '3141',
      contractAddress: '0x46457083d57ac1F1dE4e7B4920f1dC75Dd321124',
      wsProvider: 'wss://wss.hyperspace.node.glif.io/apigw/lotus/rpc/v1'
    }
  },
  optimism: {
    mainnet: {
      chainId: '10',
      wsProvider:
        'wss://g.w.lavanet.xyz:443/gateway/optm/rpc/654ffff52d55ada78b6e82ffda56ba65'
    },
    testnet: {
      chainId: '420',
      wsProvider:
        'wss://g.w.lavanet.xyz:443/gateway/optmt/rpc/654ffff52d55ada78b6e82ffda56ba65'
    }
  }
}

export const APPROVED_NETWORKS = [
  TEAM_NETWORK_MAP.filecoin.mainnet.chainId,
  TEAM_NETWORK_MAP.filecoin.testnet.chainId,
  TEAM_NETWORK_MAP.ethereum.mainnet.chainId,
  TEAM_NETWORK_MAP.ethereum.testnet.chainId,
]

/**
 * Initialise the networkStore and have it listen for blockHeight change
 */
export const initialise = async (team): Promise<void> => {
  // console.log('team', team)
  const wsProvider = new ethers.providers.WebSocketProvider(TEAM_NETWORK_MAP[team].testnet.wsProvider)
  const contract = getStore(contractStore)
  const paramInterface = new ethers.utils.Interface(abi)

  // Attach the paramIntface to the contractStore if it doesn't exist yet
  if (!contract.paramInterface) {
    contractStore.update(state => ({
      ...state,
      paramInterface
    }))
  }

  // `block` events take a little while to start coming through, so we'll fetch the startingBlock first
  const startingBlock = await wsProvider.getBlockNumber()
  networkStore.update(state => ({
    ...state,
    blockHeight: startingBlock
  }))

  wsProvider.on('block', blockHeight => {
    networkStore.update(state => {
      return {
        ...state,
        ...(state?.blockHeight !== blockHeight ? { blockHeight } : {})
      }
    })
  })

  wsProvider.on('pending', async txHash => {
    const transaction = await wsProvider.getTransaction(txHash)

    // console.log('transaction', transaction)

    if (
      !!transaction?.to &&
      transaction.to.toLowerCase() ===
        TEAM_NETWORK_MAP[team].testnet.contractAddress.toLowerCase()
    ) {
      const decodedData = paramInterface.parseTransaction({
        data: transaction.data,
        value: transaction.value
      })
      // console.log('decodedData', decodedData)
      const blockHeight = decodedData.args[1].toNumber()
      const choice = VOTES_KEY_MAP[decodedData.args[0]]

      networkStore.update(state => ({
        ...state,
        pendingTransactions: [
          ...state.pendingTransactions,
          {
            blockHeight: Number(blockHeight),
            choice,
            txHash
          }
        ]
      }))

      await checkStatusOfPendingTX(txHash)
    }
  })

  // wsProvider.on('error', async () => {
  //   console.log(`Unable to connect to ${WS_PROVIDER_URL_FILECOIN} retrying in 3s...`)
  //   setTimeout(initialise, 3000)
  // })
  // wsProvider.on('close', async code => {
  //   console.log(
  //     `Connection lost with code ${code}! Attempting reconnect in 3s...`
  //   )
  //   wsProvider.websocket.close()
  //   setTimeout(initialise, 3000)
  // })
}

/**
 * Prompt the user to switch to hyperspace
 */
export const switchChain = async (team) => {
  try {
    const session = getStore(sessionStore)
    // console.log('session.ethereumClient.chains', session.ethereumClient.chains)
    // const contract = getStore(contractStore)
    await switchNetwork({ chainId: session.ethereumClient.chains[team === 'ethereum' ? 3 : 1].id })
    // await contract.provider?.request({
    //   method: 'wallet_switchEthereumChain',
    //   params: [{ chainId: APPROVED_CHAIN_IDS.hyperspace }]
    // })
  } catch (error) {
    console.error(error)
    // goto('/')
    // addNotification('Please switch to the Hyperspace testnet', 'error')
  }
}


/**
 * Poll for the tx receipt to show or hide the user's pending vote
 */
export const checkStatusOfPendingTX = async (txHash: string, isUsersTx: boolean = false): Promise<void> => {
  let receipt = null
  while (receipt === null) {
    try {
      const contract = getStore(contractStore)
      receipt = await contract.provider.getTransactionReceipt(txHash)

      if (receipt === null) {
        if (dev) {
          console.log('Checking for tx receipt...')
        }
        continue
      }

      await fetchGameState()

      if (isUsersTx) {
        networkStore.update((state) => ({
          ...state,
          pendingTransaction: null
        }))
      } else {
        networkStore.update(state => ({
          ...state,
          pendingTransactions: state.pendingTransactions.filter((tx) => String(tx.txHash) !== String(txHash)),
        }))
      }

      if (dev) {
        console.log('Receipt fetched:', receipt)
      }
    } catch (e) {
      console.error(e)
      break
    }
  }
}
