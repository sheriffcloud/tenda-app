import * as SecureStore from 'expo-secure-store'

const JWT_TOKEN_KEY = 'jwt_token'
const WALLET_ADDRESS_KEY = 'wallet_address'

export async function getJwtToken(): Promise<string | null> {
  return SecureStore.getItemAsync(JWT_TOKEN_KEY)
}

export async function setJwtToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(JWT_TOKEN_KEY, token)
}

export async function deleteJwtToken(): Promise<void> {
  await SecureStore.deleteItemAsync(JWT_TOKEN_KEY)
}

export async function getWalletAddress(): Promise<string | null> {
  return SecureStore.getItemAsync(WALLET_ADDRESS_KEY)
}

export async function setWalletAddress(address: string): Promise<void> {
  await SecureStore.setItemAsync(WALLET_ADDRESS_KEY, address)
}

export async function deleteWalletAddress(): Promise<void> {
  await SecureStore.deleteItemAsync(WALLET_ADDRESS_KEY)
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([
    deleteJwtToken(),
    deleteWalletAddress(),
  ])
}

// Backwards-compatible helpers
export async function getToken(): Promise<string | null> {
  return getJwtToken()
}

export async function setToken(token: string): Promise<void> {
  await setJwtToken(token)
}

export async function deleteToken(): Promise<void> {
  await deleteJwtToken()
}
