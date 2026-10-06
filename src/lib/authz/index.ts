/**
 * The single entry point for authorization. Server code imports from
 * "@/lib/authz"; nothing else decides who may see or change what.
 */
export * from "./policy";
export * from "./session";
export * from "./campuses";
export * from "./portal-policy";
export * from "./portal";
