// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { UpdateMetrics } from "./rest-definitions";

export {
  AccessKeyRequest,
  Account,
  App,
  CollaboratorMap,
  CollaboratorProperties,
  Deployment,
  DeploymentMetrics,
  Package,
  PackageInfo,
  AccessKey as ServerAccessKey,
  UpdateMetrics,
  BaseRelease,
} from "./rest-definitions";

export interface CodePushError {
  message: string;
  statusCode: number;
}

export interface AccessKey {
  createdTime: number;
  expires: number;
  name: string;
  key?: string;
}

export interface Session {
  loggedInTime: number;
  machineName: string;
}

export type Headers = { [headerName: string]: string };

export interface UpdateMetricsWithTotalActive extends UpdateMetrics {
  totalActive: number;
}

export interface PackageWithMetrics {
  metrics?: UpdateMetricsWithTotalActive;
}
