export type GatewayProtocolFrame = ConnectFrame | EventFrame | RequestFrame | ResponseFrame;
export type Caps = string[];
export type Commands = string[];
export type Devicefamily = string | null;
export type Deviceid = string | null;
export type Devicesignature = string | null;
export type Nonce = string | null;
export type Platform = string | null;
export type Protocolversion = number;
export type Publickey = string | null;
export type Role = "operator" | "node";
export type Scopes = string[];
export type Token = string | null;
export type Type = "connect";
export type Event = string;
export type Seq = number;
export type Stateversion = number;
export type Type1 = "event";
export type Id = string;
export type Idempotencykey = string | null;
export type Method = string;
export type Type2 = "req";
export type Error = {
  [k: string]: string;
} | null;
export type Id1 = string;
export type Ok = boolean;
export type Type3 = "res";

export interface ConnectFrame {
  caps?: Caps;
  commands?: Commands;
  deviceFamily?: Devicefamily;
  deviceId?: Deviceid;
  deviceSignature?: Devicesignature;
  nonce?: Nonce;
  platform?: Platform;
  protocolVersion?: Protocolversion;
  publicKey?: Publickey;
  role?: Role;
  scopes?: Scopes;
  token?: Token;
  type: Type;
}
export interface EventFrame {
  event: Event;
  payload: Payload;
  seq: Seq;
  stateVersion?: Stateversion;
  type?: Type1;
}
export interface Payload {
  [k: string]: unknown;
}
export interface RequestFrame {
  id: Id;
  idempotencyKey?: Idempotencykey;
  method: Method;
  params?: Params;
  type: Type2;
}
export interface Params {
  [k: string]: unknown;
}
export interface ResponseFrame {
  error?: Error;
  id: Id1;
  ok: Ok;
  payload?: unknown;
  type?: Type3;
}
