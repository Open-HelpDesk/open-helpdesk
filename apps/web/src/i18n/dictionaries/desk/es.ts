import { desk_portal_es } from "./portal/es";
import { desk_it_es } from "./it/es";
import { desk_ee_es } from "./ee/es";
import { desk_cfg_es } from "./cfg/es";
import { desk_domain_es } from "./domain/es";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_es = { ...desk_portal_es, ...desk_it_es, ...desk_ee_es, ...desk_cfg_es, ...desk_domain_es };
