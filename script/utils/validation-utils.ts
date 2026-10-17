import * as semver from "semver";

// The rules of the email-validator package (2.0.4) this replaced
const EMAIL_REGEX =
  /^[-!#$%&'*+/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

function isValidEmail(email: string): boolean {
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) return false;
  const [localPart, domain] = email.split("@");
  return localPart.length <= 64 && domain.split(".").every((label) => label.length <= 63);
}

export function throwForInvalidEmail(email: string): void {
  if (!isValidEmail(email)) {
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

export function isValidVersion(version: string): boolean {
  return !!semver.valid(version) || /^\d+\.\d+$/.test(version);
}
