**Guide Overview:**
1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
    - 2.1 [Installing Required Tools](#21-installing-required-tools)
    - 2.2 [Setting Up Revopush CLI](#22-setting-up-revopush-cli)
3. [Migrating from Appcenter to Revopush](#3-migrating-from-appcenter-to-revopush)
    - 3.1 [Logging In](#31-logging-in)
    - 3.2 [Migrating Applications and Deployments](#32-migrating-applications-and-deployments)
4. [Setting Up Revopush from Scratch](#4-setting-up-revopush-from-scratch)
    - 4.1 [Logging In](#41-logging-in)
    - 4.2 [Creating Applications](#42-creating-applications)
    - 4.3 [Creating Deployments](#43-creating-deployments)
5. [Updating Your React Native App](#5-updating-your-react-native-app)
    - 5.1 [iOS Configuration](#51-ios-configuration)
    - 5.2 [Android Configuration](#52-android-configuration)
6. [Releasing Updates](#6-releasing-updates)
    - 6.1 [For iOS](#61-for-ios)
    - 6.2 [For Android](#62-for-android)
    - 6.3 [Additional Options](#63-additional-options)
7. [Summary and Resources](#7-summary-and-resources)

## 1. Introduction

Welcome! This guide will help you migrate your Over-the-Air (OTA) updates from Appcenter to Revopush. 
With Revopush's Command Line Interface (CLI), you can easily push updates directly to your users' devices 
without needing to go through app stores.

**What You'll Learn:**
- How to install the Revopush CLI
- Migrating your existing OTA updates from Appcenter
- Setting up and managing your applications and deployments in Revopush
- Updating your React Native app to use Revopush for OTA updates

Let’s get started!

## 2. Prerequisites

Before you begin, ensure you have the following (depends on your platform and preferences):

- **Developer Tools Installed:**
    - [Node.js](https://nodejs.org/)
    - npm or Yarn
    - npx
    - [Android Studio](https://developer.android.com/studio)
    - [Xcode](https://developer.apple.com/xcode/)
    - [Visual Studio Code](https://code.visualstudio.com/)

- **Permissions:**
    - Ability to install npm packages globally.

- **Revopush Account:**
    - Sign up at [Revopush](https://revopush.org/) using GitHub or Google for authentication.

- **(If Migrating) Appcenter Access:**
    - Ensure you have access to your existing Appcenter account and its CLI.

### 2.1 Installing Required Tools
You manage most of CodePush's functionality using the App Center CLI.
If you had one installed, you can update it to the latest version by running the following command:

```shell
   npm update -g appcenter
```

or install it from scratch by running the following command:

```shell
   npm install -g appcenter@latest
```

Upon installation or update, you can check the version of the App Center CLI by running the following command:

```shell
   appcenter -h
```

which will display the version of the App Center CLI you have installed with available commands.

```shell
$ appcenter -h 

Visual Studio App Center helps you build, test, distribute, and monitor mobile apps.
Version 3.0.3

Usage: appcenter <command>

Commands:
    analytics                      View events, audience info, sessions, and other analytics for apps                                                        
    apps                           View and manage apps                                                                                                      
    build                          Start builds, get their status, and download artifacts                                                                    
    codepush                       View and manage CodePush deployments and releases                                                                         
    crashes                        Upload symbols for better crash reports                                                                                   
    distribute                     Send builds to testers and manage distribution groups                                                                     
    orgs                           Manage organizations                                                                                                      
    profile                        Manage your profile                                                                                                       
    telemetry                      Manage telemetry preferences                                                                                              
    test                           Start test runs and get their status                                                                                      
    tokens                         Manage API tokens                                                                                                         
    help                           Get help using appcenter commands                                                                                         
    login                          Log in                                                                                                                    
    logout                         Log out                                                                                                                   
    setup-autocomplete             Setup tab completion for your shell 
```

### 2.2 Setting Up Revopush CLI
Similarly to Appcenter Revopush manages the most of CodePush's functionality using CLI.

To install it run the following command:

**Install Revopush CLI:**
```shell
   npm install -g @revopush/code-push-cli
```

**Update Revopush CLI to the Latest Version:**
```shell
   npm update -g @revopush/code-push-cli
```

Upon installation or update, you can check the version of the Revopush CLI and the list of available commands by running the following command:

**Verify Installation:**
```shell
   revopush -h
```

which will display the version of the Revopush CLI you have installed with available commands.

```shell
revopush -h
 ____                 ____            _     
|  _ \ _____   _____ |  _ \ _   _ ___| |__  
| |_) / _ \ \ / / _ \| |_) | | | / __| '_ \ 
|  _ <  __/\ V / (_) |  __/| |_| \__ \ | | |
|_| \_\___| \_/ \___/|_|    \__,_|___/_| |_| CLI v0.0.1
============================================
Revopush is a service that enables you to deploy mobile app updates directly to your users devices. Visit our website https://revopush.org/ 

Usage: revopush <command>

Commands:
  revopush access-key     View and manage the access keys associated with your account
  revopush app            View and manage your CodePush apps
  revopush collaborator   View and manage app collaborators
  revopush debug          View the CodePush debug logs for a running app
  revopush deployment     View and manage your app deployments
  revopush login          Authenticate with the CodePush server in order to begin managing your apps
  revopush logout         Log out of the current session
  revopush patch          Update the metadata for an existing release
  revopush promote        Promote the latest release from one app deployment to another
  revopush register       Register a new CodePush account
  revopush release        Release an update to an app deployment
  revopush release-react  Release a React Native update to an app deployment
  revopush rollback       Rollback the latest release for an app deployment
  revopush session        View and manage the current login sessions associated with your account
  revopush whoami         Display the account info for the current login session

Options:
      --help     Show help  [boolean]
  -v, --version  Show version number  [boolean]

```

 ## 3. Migrating from Appcenter to Revopush

You need to execute steps in this section if you have been using Appcenter for OTA updates and wish to migrate to Revopush.

If you did not use Appcenter OTA updates before and just wish to apply
OTA on top of Revopush for your app feel free to skip this section and go to section [4](#4-setting-up-revopush-from-scratch).

### 3.1 Logging In

Execute the following command to login to Appcenter CLI using provider of your choice (GitHub, Facebook, Microsoft, Google):

```shell
  appcenter login
```

Similarly, in a separate window login to Revopush CLI using the following command:

```shell
  revopush login
```

### 3.2 Migrating Applications and Deployments
**1. List Your Appcenter Apps:**

```shell
  appcenter apps list
```

Example Output:

```shell
  johndoe/rn2_android
  johndoe/rn2_ios
```

For given guide we assume that `johndoe/rn2_android` is the React Native application for Android and `johndoe/rn2_ios`
is the React Native application for iOS.

You can check target OS of the app using command `appcenter apps show -a <app name here>`.

**Android:**

```shell
appcenter apps show -a johndoe/rn2_android
App Secret:            6c3cb412-105f-422f-b795-af53d0b36a5f
Description:           
Display Name:          rn2_android
Name:                  rn2_android
OS:                    Android
Platform:              React-Native
Release Type:          Alpha
Owner ID:              a1265e53-0599-4340-8003-7c40f0caff38
Owner Display Name:    John Doe
Owner Email:           johndoe@joghdoe.com
Owner Name:            johndoe
Azure Subscription ID: 
```

**iOS:**

```shell
appcenter apps show -a johndoe/rn2_ios    
App Secret:            37d1dce7-a991-4ccc-8a0c-1ff8ed00f45d
Description:           
Display Name:          rn2_ios
Name:                  rn2_ios
OS:                    iOS
Platform:              React-Native
Release Type:          
Owner ID:              a2265e53-0699-4340-8003-7c41f0caff39
Owner Display Name:    John Doe
Owner Email:           johndoe@johndoe.com
Owner Name:            johndoe
Azure Subscription ID: 
```


**2. Create Corresponding Revopush Apps:**

Remove the username prefix when creating apps in Revopush.

```shell
  revopush app add rn2_ios
  revopush app add rn2_android
```

Example Output:

```shell
Successfully added the "rn2_ios" app, along with the following default deployments:
┌────────────┬────────────────────────────────────────┐
│ Name       │ Deployment Key                         │
├────────────┼────────────────────────────────────────┤
│ Production │ Z7v_81HyATiWlqZjvQFyu9GIicXAVJHvdy5W-g │
├────────────┼────────────────────────────────────────┤
│ Staging    │ PjAEsKZUdAytb5Rq3Kb6yHVfn-H3VJHvdy5W-g │
└────────────┴────────────────────────────────────────┘
```

```shell
Successfully added the "rn2_android" app, along with the following default deployments:
┌────────────┬────────────────────────────────────────┐
│ Name       │ Deployment Key                         │
├────────────┼────────────────────────────────────────┤
│ Production │ EVGdS0GR4Sus584cdyZ95wmwI405VJHvdy5W-g │
├────────────┼────────────────────────────────────────┤
│ Staging    │ pkCafa80S-ji3y6Xey6zVcEju9AHVJHvdy5W-g │
└────────────┴────────────────────────────────────────┘
```


**3. Replicate Deployments:**

List Appcenter deployments:

```shell
appcenter codepush deployment list -k -a johndoe/rn2_ios
```

Add the same deployments in Revopush with identical keys

```shell
revopush deployment add rn2_ios appcenter_Staging -k <Staging_Key>
revopush deployment add rn2_ios appcenter_Production -k <Production_Key>
```

Repeat for Android

```shell
appcenter codepush deployment list -k -a johndoe/rn2_android
revopush deployment add rn2_android appcenter_Staging -k <Staging_Key>
revopush deployment add rn2_android appcenter_Production -k <Production_Key>
```

Repeat for all other deployment you have in Appcenter and wish to continue to use in Revopush.

## 4. Setting Up Revopush from Scratch

If you're new to Revopush and want to set up OTA updates for your app, follow these steps.

### 4.1 Logging In

```shell
  revopush login
```

### 4.2 Creating Applications

#### For iOS

```shell
revopush app add myAmazingApp_ios
```

#### For Android:

```shell
revopush app add myAmazingApp_android
```

This will create your app along with default Staging and Production deployments.

### 4.3 Creating Deployments

If you need more deployments (e.g., Development, Testing), use:

```shell
revopush deployment add myAmazingApp_android Development
```

List All Deployments:

```shell
revopush deployment ls myAmazingApp_android -k
```

## 5. Updating Your React Native App

After setting up Revopush, update your React Native application to point to the Revopush server.

### 5.1 iOS Configuration

1. **Open `Info.plist`:** Add the following entries:

```xml
<key>CodePushDeploymentKey</key>
<string>Your_Deployment_Key</string>
<key>CodePushServerURL</key>
<string>https://api.revopush.org</string>
```

An example for `myAmazingApp_ios` app and `Staging` deployment:

```xml
<key>CodePushDeploymentKey</key>
<string>vUOFPtZfOlhXHPEDE3nkf7nP6lJ4VJHvdy5W-g</string>
<key>CodePushServerURL</key>
<string>https://api.revopush.org</string>
```

2. **Dynamic Deployment Key (Optional):** To switch deployments dynamically in your JavaScript code, use [Code-Push options](https://github.com/microsoft/react-native-code-push/blob/master/docs/api-js.md#CodePushOptions)

### 5.2 Android Configuration

1. Open `strings.xml`: Add the following entries:

```xml
<string moduleConfig="true" name="CodePushDeploymentKey">Your_Deployment_Key</string>
<string moduleConfig="true" name="CodePushServerUrl">https://api.revopush.org</string>
```

An example `myAmazingApp_android` app and `Staging` deployment `strings.xml`:

```xml
<string moduleConfig="true" name="CodePushDeploymentKey">kbAXqSrgEfLPcuvU3Fe0SCqX5HpOVJHvdy5W-g</string>
<string moduleConfig="true" name="CodePushServerUrl">https://api.revopush.org</string>
```

2.  **Dynamic Deployment Key (Optional):** To switch deployments dynamically in your JavaScript code, use [Code-Push options](https://github.com/microsoft/react-native-code-push/blob/master/docs/api-js.md#CodePushOptions)

## 6. Releasing Updates

Once your app is configured, you can release updates to your users.

### 6.1 For iOS

```shell
revopush release-react rn2_ios ios -d Staging
```

**What Happens:**
- Bundles your JavaScript code.
- Uploads the bundle and assets to Revopush.
- Releases the update to the Staging deployment of rn2_ios.

**Success Message:**

```shell
...
Successfully released an update containing the "/var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush" directory to the "Staging" deployment of the "rn2_ios" app.
```

### 6.2 For Android

```shell
revopush release-react rn2_android android -d appcenter-Staging
```

**What Happens:**

- Bundles your JavaScript code.
- Uploads the bundle and assets to Revopush.
- Releases the update to the appcenter-Staging deployment of rn2_android.

**Success Message:**

```shell
...
Successfully released an update containing the "/var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush" directory to the "appcenter-Staging" deployment of the "rn2_android" app.
```

### 6.3 Additional Options

For more customization, view all options:

```shell
revopush release-react -h
```

## 7. Summary and Resources


Migrating your OTA updates from Appcenter to Revopush is straightforward with our CLI tools. 
Whether you're migrating existing applications or setting up new ones,
Revopush offers a seamless experience with familiar commands and robust features.


**Quick Command Reference:**

| Appcenter                        | Revopush                |                                                                     Comment                                                                      | 
|:---------------------------------|:------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------:|
| `appcenter login`                 | `revopush login`         |                                                                      Log in                                                                      |
| `appcenter codepush deployment`   | `revopush deployment`    |                                                       View and manage your app deployments                                                       |
| `appcenter apps`                  | `revopush app`           |                                                            View and manage your apps                                                             |
| `appcenter codepush patch`        | `revopush patch`         |                                               Update the metadata for an existing CodePush release                                               |
| `appcenter codepush promote`      | `revopush promote`       | Create a new release for the destination deployment, which includes the exact code and metadata from the latest release of the source deployment |
| `appcenter codepush release-react`| `revopush release-react` |                                                Release a React Native update to an app deployment                                                |
| `appcenter codepush rollback`    | `revopush rollback`       |                                                   Rollback a deployment to a previous release                                                    |
| `appcenter logout`               | `revopush logout`         |                                                                     Log out                                                                      |

### **Helpful Resources:**
- React Native CodePush [GitHub](https://github.com/microsoft/react-native-code-push)
- React Native Client SDK [docs](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-overview)
- Best practices for [Multi-Deployment Testing](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-deployment)

**Need More Help?**
Contact our support team at [support@revopush.org](mailto:support@revopush.org) or visit our [website](https://revopush.org).

