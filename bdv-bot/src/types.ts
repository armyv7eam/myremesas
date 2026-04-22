export interface BdvAccountSnapshot {
  description: string;
  maskedAccount: string;
  balanceVisible: boolean;
  movementActionVisible: boolean;
}

export interface BdvArtifactRef {
  kind: 'trace' | 'screenshot' | 'html' | 'meta' | 'sync-json';
  fileName: string;
  relativePath: string;
  storagePath?: string;
}

export interface BdvSyncResult {
  capturedAt: string;
  ownerLabel: string;
  accounts: BdvAccountSnapshot[];
  source: 'bdv-playwright';
  artifacts?: BdvArtifactRef[];
}

export interface MercantilMovement {
  date: string;
  reference: string;
  description: string;
  amountBs: number | null;
}

export interface MercantilAccountDetailResult {
  capturedAt: string;
  ownerLabel: string;
  accountLabel: string | null;
  availableBalanceBs: number | null;
  balanceBreakdown: {
    deferredBs: number | null;
    blockedBs: number | null;
    totalBs: number | null;
  };
  monthLabel: string | null;
  movements: MercantilMovement[];
  source: 'mercantil-cdp-manual';
  artifacts?: BdvArtifactRef[];
}

export interface MercantilTransferResult {
  capturedAt: string;
  ownerLabel: string;
  beneficiaryLabel: string | null;
  beneficiaryAlias: string | null;
  beneficiaryLast4: string | null;
  sourceAccountLabel: string | null;
  amountBs: number | null;
  concept: string | null;
  reference: string | null;
  executedAtLabel: string | null;
  source: 'mercantil-cdp-manual';
  artifacts?: BdvArtifactRef[];
}
