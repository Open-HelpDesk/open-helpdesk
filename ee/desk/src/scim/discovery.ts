/**
 * The three discovery endpoints (RFC 7644 §4): what this server supports,
 * which resource types it serves, and their schemas. Identity providers read
 * them when a connection is set up; they must tell the truth — no bulk, no
 * sort, no password change, filter capped at 200 results.
 */
import {
  SCHEMA_ENTERPRISE,
  SCHEMA_GROUP,
  SCHEMA_LIST,
  SCHEMA_OHD,
  SCHEMA_RT,
  SCHEMA_SCHEMA,
  SCHEMA_SPC,
  SCHEMA_USER,
  SCIM_BASE_PATH,
} from "./protocol";

export const MAX_RESULTS = 200;

export function serviceProviderConfig() {
  return {
    schemas: [SCHEMA_SPC],
    documentationUri: "https://datatracker.ietf.org/doc/html/rfc7644",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: MAX_RESULTS },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: true },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer token",
        description: "The SCIM token generated in the service desk settings.",
        primary: true,
      },
    ],
    meta: { resourceType: "ServiceProviderConfig", location: `${SCIM_BASE_PATH}/ServiceProviderConfig` },
  };
}

const USER_RT = {
  schemas: [SCHEMA_RT],
  id: "User",
  name: "User",
  endpoint: "/Users",
  description: "An employee of the directory",
  schema: SCHEMA_USER,
  schemaExtensions: [
    { schema: SCHEMA_ENTERPRISE, required: false },
    { schema: SCHEMA_OHD, required: false },
  ],
  meta: { resourceType: "ResourceType", location: `${SCIM_BASE_PATH}/ResourceTypes/User` },
};

const GROUP_RT = {
  schemas: [SCHEMA_RT],
  id: "Group",
  name: "Group",
  endpoint: "/Groups",
  description: "A group of employees",
  schema: SCHEMA_GROUP,
  meta: { resourceType: "ResourceType", location: `${SCIM_BASE_PATH}/ResourceTypes/Group` },
};

export function resourceTypes(id?: string) {
  const all = [USER_RT, GROUP_RT];
  if (id) return all.find((r) => r.id.toLowerCase() === id.toLowerCase()) ?? null;
  return { schemas: [SCHEMA_LIST], totalResults: all.length, startIndex: 1, itemsPerPage: all.length, Resources: all };
}

type Attr = {
  name: string;
  type: "string" | "boolean" | "complex" | "reference" | "dateTime";
  multiValued?: boolean;
  required?: boolean;
  mutability?: "readOnly" | "readWrite" | "immutable" | "writeOnly";
  uniqueness?: "none" | "server" | "global";
  caseExact?: boolean;
  subAttributes?: Attr[];
  referenceTypes?: string[];
};

function attr(a: Attr): Record<string, unknown> {
  return {
    name: a.name,
    type: a.type,
    multiValued: a.multiValued ?? false,
    description: "",
    required: a.required ?? false,
    caseExact: a.caseExact ?? false,
    mutability: a.mutability ?? "readWrite",
    returned: "default",
    uniqueness: a.uniqueness ?? "none",
    ...(a.subAttributes ? { subAttributes: a.subAttributes.map(attr) } : {}),
    ...(a.referenceTypes ? { referenceTypes: a.referenceTypes } : {}),
  };
}

const s = (name: string, extra: Partial<Attr> = {}): Attr => ({ name, type: "string", ...extra });

const SCHEMAS = [
  {
    id: SCHEMA_USER,
    name: "User",
    description: "User Account",
    attributes: [
      s("userName", { required: true, uniqueness: "server" }),
      { name: "name", type: "complex" as const, subAttributes: [s("formatted"), s("familyName"), s("givenName"), s("middleName")] },
      s("displayName"),
      s("title"),
      s("externalId", { caseExact: true }),
      { name: "active", type: "boolean" as const },
      {
        name: "emails",
        type: "complex" as const,
        multiValued: true,
        subAttributes: [s("value"), s("type"), { name: "primary", type: "boolean" as const }],
      },
    ].map((a) => attr(a as Attr)),
  },
  {
    id: SCHEMA_ENTERPRISE,
    name: "EnterpriseUser",
    description: "Enterprise User",
    attributes: [
      s("employeeNumber"),
      s("department"),
      s("organization"),
      s("division"),
      {
        name: "manager",
        type: "complex" as const,
        subAttributes: [s("value"), { name: "$ref", type: "reference" as const, referenceTypes: ["User"] }, s("displayName", { mutability: "readOnly" })],
      },
    ].map((a) => attr(a as Attr)),
  },
  {
    id: SCHEMA_OHD,
    name: "OpenHelpDeskUser",
    description: "Hire and leave dates (ISO 8601 date), which drive joiners and leavers.",
    attributes: [s("hireDate"), s("leaveDate")].map(attr),
  },
  {
    id: SCHEMA_GROUP,
    name: "Group",
    description: "Group",
    attributes: [
      s("displayName", { required: true, uniqueness: "server" }),
      s("externalId", { caseExact: true }),
      {
        name: "members",
        type: "complex" as const,
        multiValued: true,
        subAttributes: [s("value", { mutability: "immutable" }), { name: "$ref", type: "reference" as const, referenceTypes: ["User"] }, s("display")],
      },
    ].map((a) => attr(a as Attr)),
  },
].map((schema) => ({
  schemas: [SCHEMA_SCHEMA],
  ...schema,
  meta: { resourceType: "Schema", location: `${SCIM_BASE_PATH}/Schemas/${schema.id}` },
}));

export function schemas(id?: string) {
  if (id) return SCHEMAS.find((x) => x.id.toLowerCase() === id.toLowerCase()) ?? null;
  return { schemas: [SCHEMA_LIST], totalResults: SCHEMAS.length, startIndex: 1, itemsPerPage: SCHEMAS.length, Resources: SCHEMAS };
}
