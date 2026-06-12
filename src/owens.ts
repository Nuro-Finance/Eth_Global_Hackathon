import axios from 'axios'
import { CONFIG } from './config'
import { OwensContract } from './types'

export interface OnboardResponse {
    userId: string
    applicationStatus: string
    kycCompletionLink: {
        url: string
        params: { userId: string }
    }
}

const onboardClient = axios.create({
    baseURL: 'https://rocket.sd3.gg/api/proxy',
    headers: { 'x-api-key': CONFIG.OWENS_API_KEY },
})

const issuingClient = axios.create({
    baseURL: CONFIG.OWENS_API_BASE,
    headers: { 'x-api-key': CONFIG.OWENS_API_KEY },
})

export async function onboardUser(
    firstName: string,
    lastName: string,
    email: string
): Promise<OnboardResponse> {
    const response = await onboardClient.post<OnboardResponse>('/users/onboard', {
        firstName,
        lastName,
        email,
    })
    return response.data
}

export async function createCard(owenUserId: string): Promise<string> {
  const response = await issuingClient.post<{ cardId: string }>(`/users/${owenUserId}/cards`)
  return response.data.cardId
}


export interface OwenCardDetails {
  cardId: string
  cardNumber: string
  expiryDate: string
  cvv: string
  status: string
}

export async function getCardDetails(owenCardId: string): Promise<OwenCardDetails> {
  const response = await issuingClient.get<OwenCardDetails>(`/cards/${owenCardId}`)
  return response.data
}
export async function freezeCard(cardId: string, freeze: boolean): Promise<void> {
  // 2026-05-30: Issuer status enum = { 'active' | 'locked' }. Discovered
  // via probe (scripts/probe-issuer-freeze.ts). See issuers.ts:101 for
  // the full discovery trail.
  await issuingClient.patch(`/cards/${cardId}`, {
    status: freeze ? 'locked' : 'active',
  })
}

export async function getUserBaseDepositAddress(userId: string): Promise<string> {
    const response = await issuingClient.get<OwensContract[]>(`/users/${userId}/contracts`)
    const contracts = response.data
    const baseContract = contracts.find(c => c.chainId === CONFIG.BASE_CHAIN_ID)
    if (!baseContract) {
        throw new Error(`No Base contract found for userId: ${userId}`)
    }
    return baseContract.depositAddress
}
