/**
 * Key Management Service (KMS) types
 *
 * The Orbitport gateway exposes KMS over JSON-RPC 2.0 at POST /api/v1/rpc.
 * Inputs are camelCase (idiomatic JS); outputs preserve the PascalCase wire
 * shape so users can grep gateway docs.
 */

export type Scheme = 'TRANSIT' | 'ETHEREUM';

export type KeySpec =
  | 'AES_256_GCM96'
  | 'SYMMETRIC_DEFAULT' // legacy / op-dev only
  | 'ECDSA_P256'
  | 'ECDSA_P384'
  | 'ED25519'
  | 'RSA_4096'
  | 'ECC_SECG_P256K1';

export type KeyUsage = 'ENCRYPT_DECRYPT' | 'SIGN_VERIFY';

export type SigningAlgorithm =
  | 'ECDSA_SHA_256'
  | 'ECDSA_SHA_384'
  | 'ED25519'
  | 'ETHEREUM_SECP256K1'
  | 'RSASSA_PKCS1_V1_5_SHA_256'
  | 'RSASSA_PSS_SHA_256';

export type MessageType = 'RAW' | 'DIGEST' | 'EIP191';

export type DataKeySpec = 'AES_128' | 'AES_256';

export type EncryptionAlgorithm = 'AES_256_GCM96';

export interface Tag {
  TagKey: string;
  TagValue: string;
}

export interface KeyMetadata {
  KeyId: string;
  Description: string;
  KeySpec: string;
  KeyUsage: string;
  Enabled: boolean;
  PrimaryVersion: number;
  CreationDate: string;
  Tags: Tag[];
  Scheme: string;
  Alias: string;
  PublicKey?: string;
  Address?: string; // populated for ETHEREUM scheme
}

export interface SchemeCapability {
  Scheme: string;
  KeySpecs: string[];
  KeyUsages: string[];
  EncryptionAlgorithms: string[];
  DataKeySpecs: string[];
  SigningCapabilities: { SigningAlgorithm: string; MessageTypes: string[] }[];
  SupportsEncrypt: boolean;
  SupportsDecrypt: boolean;
  SupportsGenerateDataKey: boolean;
  SupportsRotateKey: boolean;
}

// ---------------------------------------------------------------------------
// Inputs (camelCase)
// ---------------------------------------------------------------------------

export interface CreateKeyRequest {
  alias: string;
  keySpec: KeySpec;
  keyUsage: KeyUsage;
  scheme?: Scheme;
  description?: string;
  tags?: Tag[];
}

export type PlaintextEncoding = 'utf8' | 'bytes';

/**
 * Encrypt request — discriminated on `encoding`.
 *
 * - `encoding: "utf8"` (default): plaintext is a UTF-8 string.
 * - `encoding: "bytes"`: plaintext is a Uint8Array of raw bytes.
 */
export type EncryptRequest =
  | {
      keyId: string;
      plaintext: string;
      encoding?: 'utf8';
      encryptionAlgorithm?: EncryptionAlgorithm;
    }
  | {
      keyId: string;
      plaintext: Uint8Array;
      encoding: 'bytes';
      encryptionAlgorithm?: EncryptionAlgorithm;
    };

/**
 * Decrypt request — `encoding` controls the response Plaintext type.
 *
 * - `encoding: "utf8"` (default): SDK auto-decodes Plaintext to a UTF-8 string.
 * - `encoding: "bytes"`: SDK returns Plaintext as a raw Uint8Array.
 */
export type DecryptRequest =
  | {
      ciphertextBlob: string;
      keyId?: string;
      encoding?: 'utf8';
      encryptionAlgorithm?: EncryptionAlgorithm;
    }
  | {
      ciphertextBlob: string;
      keyId?: string;
      encoding: 'bytes';
      encryptionAlgorithm?: EncryptionAlgorithm;
    };

export interface SignRequest {
  keyId: string;
  message: string | Uint8Array;
  signingAlgorithm: SigningAlgorithm;
  messageType?: MessageType;
}

export interface GenerateDataKeyRequest {
  keyId: string;
  dataKeySpec?: DataKeySpec;
  numberOfBytes?: number;
}

export interface RotateKeyRequest {
  keyId: string;
}

// ---------------------------------------------------------------------------
// Outputs (PascalCase wire shape)
// ---------------------------------------------------------------------------

export interface CreateKeyResponse {
  KeyMetadata: KeyMetadata;
}

export interface EncryptResponse {
  CiphertextBlob: string;
  KeyId: string;
  EncryptionAlgorithm: string;
}

export interface DecryptResponseUtf8 {
  Plaintext: string;
  KeyId: string;
  EncryptionAlgorithm: string;
}

export interface DecryptResponseBytes {
  Plaintext: Uint8Array;
  KeyId: string;
  EncryptionAlgorithm: string;
}

export type DecryptResponse = DecryptResponseUtf8 | DecryptResponseBytes;

export interface SignResponse {
  KeyId: string;
  Signature: string; // base64
  SigningAlgorithm: string;
}

export interface GenerateDataKeyResponse {
  KeyId: string;
  Plaintext: string; // raw base64 (binary key material)
  CiphertextBlob: string;
}

export interface RotateKeyResponse {
  KeyMetadata: KeyMetadata;
}

export interface GetCapabilitiesResponse {
  Schemes: SchemeCapability[];
}
