import { env } from "@/shared/config/env";
import { createChainCollateral } from "./collateral-chain";
import { createLiveApi } from "./live";
import type { CollateralApi, PerpApi } from "./types";

export const perpApi: PerpApi = createLiveApi({ baseUrl: env.gatewayUrl, wsUrl: env.gatewayWsUrl });

export const collateralApi: CollateralApi = createChainCollateral();
