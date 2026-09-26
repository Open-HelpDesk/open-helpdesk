import { desk_portal_cs } from "./portal/cs";
import { desk_it_cs } from "./it/cs";
import { desk_ee_cs } from "./ee/cs";
import { desk_cfg_cs } from "./cfg/cs";
import { desk_domain_cs } from "./domain/cs";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_cs = { ...desk_portal_cs, ...desk_it_cs, ...desk_ee_cs, ...desk_cfg_cs, ...desk_domain_cs };
