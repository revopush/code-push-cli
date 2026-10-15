import * as semver from "semver";

const emailValidator = require("email-validator");

export function throwForInvalidEmail(email: string): void {
  if (!emailValidator.validate(email)) {
    throw new Error('"' + email + '" is an invalid e-mail address.');
  }
}

export function throwForInvalidSemverRange(semverRange: string | undefined): void {
  if (!semverRange) {
    throw new Error(`Unable to determine the app version. Specify it using the --targetBinaryVersion option.`);
  }
  if (semver.validRange(semverRange) === null) {
    throw new Error('Please use a semver-compliant target binary version range, for example "1.0.0", "*" or "^1.2.3".');
  }
}

export function throwForInvalidOutputFormat(format: string): void {
  switch (format) {
    case "json":
    case "table":
      break;

    default:
      throw new Error("Invalid format:  " + format + ".");
  }
}

export function isCommandOptionSpecified(option: any): boolean {
  return option !== undefined && option !== null;
}
