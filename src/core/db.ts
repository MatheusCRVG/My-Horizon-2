// Compatibility facade: existing modules keep their storage keys and API.
import { repository } from "../services/storage/repository";
export const db = {
  vaults: {
    get: repository.get,
    put: repository.put,
    toArray: repository.list,
  },
};
