import { ApiResponse } from '@/modules/_api/types'
import { getCrustIpfsAuth, getIpfsPinUrl } from '@/utils/env/server'
import { SubsocialIpfsApi } from '@subsocial/api'
import { IpfsPostContent } from '@subsocial/api/types'
import { NextApiRequest, NextApiResponse } from 'next'

export type SaveFileRequest = IpfsPostContent

export type SaveFileResponse = ApiResponse<{
  cid?: string
}>

export const CRUST_IPFS_CONFIG = {
  ipfsNodeUrl: 'https://gw-seattle.cloud3.cc',
  ipfsClusterUrl: getIpfsPinUrl(),
}

const headers = { authorization: `Bearer ${getCrustIpfsAuth()}` }

const ipfs = new SubsocialIpfsApi({
  ...CRUST_IPFS_CONFIG,
  headers,
})
ipfs.setWriteHeaders(headers)
ipfs.setPinHeaders(headers)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SaveFileResponse>
) {
  if (req.method !== 'POST') return res.status(404).end()

  const body = req.body as IpfsPostContent

  let cid: string
  try {
    cid = await ipfs.saveJson(body)
    ipfs.pinContent(cid, { 'meta.gatewayId': 1 })
  } catch (e: any) {
    return res.status(500).send({
      success: false,
      errors: e.message,
      message: 'Failed to save file',
    })
  }

  res.status(200).send({ success: true, cid: cid, message: 'OK' })
}
