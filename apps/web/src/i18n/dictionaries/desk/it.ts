import { desk_portal_it } from "./portal/it";
import { desk_it_it } from "./it/it";
import { desk_ee_it } from "./ee/it";
import { desk_cfg_it } from "./cfg/it";
import { desk_domain_it } from "./domain/it";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_it = { ...desk_portal_it, ...desk_it_it, ...desk_ee_it, ...desk_cfg_it, ...desk_domain_it };
