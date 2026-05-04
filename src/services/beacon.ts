/**
 * Re-export alias for `./ipfs`.
 *
 * Historically the IPFS beacon service lived under both module names; this
 * file is now a thin re-export so internal `import './beacon'` callers and
 * external `import { BeaconService } from '@spacecomputer-io/orbitport-sdk-ts'`
 * share a single class identity (instanceof checks and structural typing
 * stay consistent across import paths).
 */

export * from './ipfs';
