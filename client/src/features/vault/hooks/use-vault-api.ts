import { createChainVaultApi } from "../api/chain";
import { createGatewayHistory } from "../api/history";

const api = createChainVaultApi();
const history = createGatewayHistory();

export const useVaultApi = () => api;

export const useVaultHistoryReader = () => history;
