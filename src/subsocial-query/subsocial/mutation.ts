import type { ApiPromise } from '@polkadot/api'
import { SubsocialApi, SubsocialIpfsApi } from '@subsocial/api'
import { useMutation, UseMutationResult } from '@tanstack/react-query'
import { makeCombinedCallback } from '../base'
import { MutationConfig } from '../types'
import { getConnectionConfig } from './config'
import { getSubsocialApi } from './connection'
import {
  DefaultSubsocialMutationConfig,
  Transaction,
  WalletAccount,
} from './types'
import { getBlockExplorerBlockInfoLink } from './utils'

export interface TxCallbacksParams {
  summary: string
  address: string
  params: any
  explorerLink?: string
  error?: string
}
const DEFAULT_TX_CALLBACKS = {
  onBroadcast: ({ summary }: TxCallbacksParams) =>
    console.info(`Broadcasting ${summary}...`),
  onError: ({ error }: TxCallbacksParams) => console.error(error),
  onSuccess: ({ summary }: TxCallbacksParams) =>
    console.log(`Success submit ${summary}...`),
}
let txCallbacks = DEFAULT_TX_CALLBACKS
export const setupTxCallbacks = (callbacks: Partial<typeof txCallbacks>) => {
  txCallbacks = { ...DEFAULT_TX_CALLBACKS, ...callbacks }
}

async function createTxAndSend<Param, AdditionalParams>(
  transactionGenerator: (
    param: Param,
    additionalParams: AdditionalParams
  ) => Promise<{ tx: Transaction; summary: string }>,
  param: Param,
  additionalParams: AdditionalParams,
  txConfig: {
    wallet: WalletAccount
    networkRpc?: string
  },
  config?: MutationConfig<Param>,
  defaultConfig?: DefaultSubsocialMutationConfig<Param>
) {
  const { tx, summary } = await transactionGenerator(param, additionalParams)
  return sendTransaction(
    {
      tx,
      wallet: txConfig.wallet,
      params: param,
      networkRpc: txConfig.networkRpc,
      summary,
    },
    config,
    defaultConfig
  )
}
function sendTransaction<Param>(
  txInfo: {
    tx: Transaction
    summary: string
    wallet: WalletAccount
    params: Param
    networkRpc: string | undefined
  },
  config?: MutationConfig<Param>,
  defaultConfig?: DefaultSubsocialMutationConfig<Param>
) {
  const {
    networkRpc,
    params,
    summary,
    tx,
    wallet: { address, signer },
  } = txInfo
  return new Promise<string>(async (resolve, reject) => {
    try {
      const unsub = await tx.signAndSend(signer, async (result: any) => {
        resolve(result.txHash.toString())
        if (result.status.isBroadcast) {
          txCallbacks.onBroadcast({
            summary,
            params: params,
            address,
          })
        } else if (result.status.isInBlock) {
          const blockHash = (result.status.toJSON() ?? ({} as any)).inBlock
          let explorerLink: string | undefined
          if (networkRpc) {
            explorerLink = getBlockExplorerBlockInfoLink(networkRpc, blockHash)
          }
          if (result.isError || result.dispatchError || result.internalError) {
            txCallbacks.onError({
              error: result.dispatchError?.toString(),
              summary,
              address,
              params,
              explorerLink,
            })
          } else {
            const onTxSuccess = makeCombinedCallback(
              defaultConfig,
              config,
              'onTxSuccess'
            )
            onTxSuccess({ params, address, result })
            txCallbacks.onSuccess({ explorerLink, summary, address, params })
          }
          unsub()
        }
      })
    } catch (e) {
      txCallbacks.onError((e as any).message)
      reject(e)
    }
  })
}

export function useSubsocialMutation<Param>(
  getWallet: () => Promise<WalletAccount>,
  transactionGenerator: (
    params: Param,
    apis: {
      subsocialApi: SubsocialApi
      ipfsApi: SubsocialIpfsApi
      substrateApi: ApiPromise
    }
  ) => Promise<{ tx: Transaction; summary: string }>,
  config?: MutationConfig<Param>,
  defaultConfig?: MutationConfig<Param>
): UseMutationResult<string, Error, Param, unknown> {
  const workerFunc = async (param: Param) => {
    const wallet = await getWallet()
    if (!wallet.address || !wallet.signer)
      throw new Error('You need to connect your wallet first!')
    const subsocialApi = await getSubsocialApi()
    const substrateApi = await subsocialApi.substrateApi
    const ipfsApi = subsocialApi.ipfs
    return createTxAndSend(
      transactionGenerator,
      param,
      { subsocialApi, substrateApi, ipfsApi },
      { wallet, networkRpc: getConnectionConfig().substrateUrl },
      config,
      defaultConfig
    )
  }

  return useMutation(workerFunc, {
    ...(defaultConfig || {}),
    ...config,
    onSuccess: makeCombinedCallback(defaultConfig, config, 'onSuccess'),
    onError: makeCombinedCallback(defaultConfig, config, 'onError'),
  })
}
