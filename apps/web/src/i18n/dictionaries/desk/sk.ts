import { desk_portal_sk } from "./portal/sk";
import { desk_it_sk } from "./it/sk";
import { desk_ee_sk } from "./ee/sk";
import { desk_cfg_sk } from "./cfg/sk";
import { desk_domain_sk } from "./domain/sk";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_sk = { ...desk_portal_sk, ...desk_it_sk, ...desk_ee_sk, ...desk_cfg_sk, ...desk_domain_sk };
