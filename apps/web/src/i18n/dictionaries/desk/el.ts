import { desk_portal_el } from "./portal/el";
import { desk_it_el } from "./it/el";
import { desk_ee_el } from "./ee/el";
import { desk_cfg_el } from "./cfg/el";
import { desk_domain_el } from "./domain/el";

/** Service desk messages for this language, assembled from the per-area fragments. */
export const desk_el = { ...desk_portal_el, ...desk_it_el, ...desk_ee_el, ...desk_cfg_el, ...desk_domain_el };
