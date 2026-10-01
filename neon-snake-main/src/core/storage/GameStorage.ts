import type { FamobiSdk } from '../../platform/FamobiSdk';

export type PlayerProfile = {
  bestScore: number;
  highestUnlockedLevel: number;
  totalRuns: number;
  playerMuted: boolean;
};

export interface GameStorage {
  loadProfile(): PlayerProfile;
  saveProfile(profile: PlayerProfile): void;
}

const defaultProfile = (): PlayerProfile => ({
  bestScore: 0,
  highestUnlockedLevel: 1,
  totalRuns: 0,
  playerMuted: false
});

export class FamobiGameStorage implements GameStorage {
  private readonly storageKey = 'neon-snake:profile';

  constructor(private readonly storage: FamobiSdk['storage']) {}

  loadProfile(): PlayerProfile {
    try {
      const storedProfile = this.storage.getItem(this.storageKey);
      if (!storedProfile) return defaultProfile();

      const value = (
        typeof storedProfile === 'string' ? JSON.parse(storedProfile) : storedProfile
      ) as Partial<PlayerProfile>;
      return {
        bestScore: this.nonNegativeInteger(value.bestScore, 0),
        highestUnlockedLevel: Math.min(
          3,
          Math.max(1, this.nonNegativeInteger(value.highestUnlockedLevel, 1))
        ),
        totalRuns: this.nonNegativeInteger(value.totalRuns, 0),
        playerMuted: typeof value.playerMuted === 'boolean' ? value.playerMuted : false
      };
    } catch {
      return defaultProfile();
    }
  }

  saveProfile(profile: PlayerProfile): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(profile));
    } catch {
      // The game remains playable when browser storage is unavailable.
    }
  }

  private nonNegativeInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
  }
}
