/** Cloud configuration contains no credentials. Credentials live in session memory. */
export type CloudProvider = 'drive' | 'github';

export interface CloudConfig {
  provider: CloudProvider;
  deviceId: string;
  githubRepo?: string;
}

export interface CloudSession {
  passphrase: string;
  githubToken?: string;
}

export interface CloudStatus {
  at: number;
  provider: CloudProvider;
  ok: boolean;
  records?: number;
  uploaded?: boolean;
  error?: string;
}

export const CLOUD_CONFIG_KEY = 'tabverse_private_cloud_config_v1';
export const CLOUD_SESSION_KEY = 'tabverse_private_cloud_session_v1';
export const CLOUD_STATUS_KEY = 'tabverse_private_cloud_status_v1';

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const result = await chrome.storage.local.get(CLOUD_CONFIG_KEY);
  const value = result[CLOUD_CONFIG_KEY] as CloudConfig | undefined;
  if (
    !value ||
    (value.provider !== 'drive' && value.provider !== 'github') ||
    typeof value.deviceId !== 'string' ||
    !/^[a-f0-9-]{36}$/i.test(value.deviceId)
  ) {
    return null;
  }
  if (value.provider === 'github' && !validGitHubRepo(value.githubRepo)) {
    return null;
  }
  return value;
}

export function validGitHubRepo(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value) &&
    !value.includes('..')
  );
}

export async function saveCloudConfig(
  provider: CloudProvider,
  githubRepo?: string,
): Promise<CloudConfig> {
  if (provider === 'github' && !validGitHubRepo(githubRepo)) {
    throw new Error('Enter a valid GitHub owner/repository.');
  }
  const previous = await loadCloudConfig();
  const cfg: CloudConfig = {
    provider,
    deviceId: previous?.deviceId ?? crypto.randomUUID(),
    githubRepo: provider === 'github' ? githubRepo : undefined,
  };
  await chrome.storage.local.set({ [CLOUD_CONFIG_KEY]: cfg });
  return cfg;
}

export async function loadCloudSession(): Promise<CloudSession | null> {
  const obj = await chrome.storage.session.get(CLOUD_SESSION_KEY);
  const secret = obj[CLOUD_SESSION_KEY] as CloudSession | undefined;
  return secret && typeof secret.passphrase === 'string'
    ? secret
    : null;
}

export async function unlockCloudSession(secret: CloudSession): Promise<void> {
  if (secret.passphrase.length < 12) {
    throw new Error('Use a sync passphrase of at least 12 characters.');
  }
  await chrome.storage.session.set({ [CLOUD_SESSION_KEY]: secret });
}

export async function disconnectCloud(): Promise<void> {
  await chrome.storage.local.remove([CLOUD_CONFIG_KEY, CLOUD_STATUS_KEY]);
  await chrome.storage.session.remove(CLOUD_SESSION_KEY);
}

export async function loadCloudStatus(): Promise<CloudStatus | null> {
  const item = await chrome.storage.local.get(CLOUD_STATUS_KEY);
  return (item[CLOUD_STATUS_KEY] as CloudStatus) ?? null;
}
