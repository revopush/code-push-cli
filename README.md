## 1. Introduction

Over-the-air (OTA) updates are a vital aspect of modern mobile application development, 
enabling developers to push updates directly to users' devices without requiring them to download a new app version from the store.

This step-by-step guide will walk you through the process of migrating your OTA updates from Appcenter to Revopush 
whether you’re an experienced developer familiar with Appcenter or a beginner exploring Revopush applying OTA for your app from scratch.

Guide contains the following steps:

- Pre-requisites. Just a few things you need to have installed or updated before you start. 
If you did not use Appcenter OTA updates before and just wish to apply OTA on top of Revopush for your app go right to the step 2.2
- Appcenter to Revopush migration. This section will guide you through the process of migrating your applications, deployments from Appcenter to Revopush.
If you did not use Appcenter OTA updates before and just wish to apply OTA on top of Revopush for your app feel free to skip this section and go to section 4.
- Create Application and Deployments in Revopush. This section will guide you through the process of creation of application, deployments in Revopush.
- Migrate your React Native application to Revopush OTA. There we describe required changes in your React Native application to start using Revopush OTA.
- Summary. This section will summarize the key points of the guide and provide you with additional resources to help you get the most out of Revopush.

Let’s get started!

## 2. Prerequisites

Whether you start from scratch or migrate from Appcenter to Revopush, 
you need necessary developer tools installed on your machine (eg [Node.js](https://nodejs.org/en), npm, yarn, npx, Android Studio, Xcode, VS Code, etc.)
which you used to use for your React Native application development. You should have permissions to install npm packages globally for further CodePush updates.

Create an account on [Revopush](https://app.revopush.org/register) to manage your applications and deployments via both UI and CLI 
using GitHub or Google as an authentication provider.

If you migrate existing application from Appcenter to Revopush you should have access to [Appcenter](https://appcenter.ms/) 
to use their UI and CLI.

### 2.1 Appcenter Command Line Interface
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

### 2.2 Revopush Command Line Interface
Similarly to Appcenter Revopush manages the most of CodePush's functionality using CLI.

To install it run the following command:

```shell
   npm install -g @revopush/code-push-cli
```

We also suggest you to periodically update the CLI to the latest version by running the following command:

```shell
   npm update -g @revopush/code-push-cli
```

Upon installation or update, you can check the version of the Revopush CLI and the list of available commands by running the following command:

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

 ## 3. Appcenter to Revopush migration

You need to execute steps in this section if you have been using Appcenter for OTA updates and wish to migrate to Revopush.

If you did not use Appcenter OTA updates before and just wish to apply
OTA on top of Revopush for your app feel free to skip this section and go to section 4.

### 3.1 Login to Appcenter and Revopush CLI

Execute the following command to login to Appcenter CLI using provider of your choice (GitHub, Facebook, Microsoft, Google):

```shell
  appcenter login
```

Similarly, in a separate window login to Revopush CLI using the following command:

```shell
  revopush login
```

### 3.2 Define the list of application to migrate
After login you can check the list of apps you have access to by running the following command:

```shell
  appcenter apps list
```

Which will display something like this:

```shell
  johndoe/rn2_android
  johndoe/rn2_ios
```

For given guide we assume that `johndoe/rn2_android` is the React Native application for Android and `johndoe/rn2_ios`
is the React Native application for iOS.

You can check target OS of the app using command `appcenter apps show -a <app name here>`.

Android:

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

iOS:

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

### 3.2 Create applications in Revopush

Now you have to create applications in Revopush for each of the applications you have in Appcenter.
Please keep in mind, compare to Appcenter, Revopush does not accept username (`<username>/<app name>`) as an application name,
you just need to take part after `<username>` in the Appcenter app name. For example:

`johndoe/rn2_ios` becomes `rn2_ios`, 
`johndoe/rn2_android` becomes `rn2_android`.

Having these names execute the following command to create applications:
```shell
  revopush app add rn2_ios
```

with response like
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

and another one for Android:
```shell
  revopush app add rn2_android
```

with response like
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

Out of the box, Revopush will also create two deployments (Staging and Production) for the application you have created.
It empowers you to use the best practices of [Multi-Deployment Testing](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-deployment). 
You can add more deployments later or delete if you need to. However, you do not have to remember or save these deployments keys, 
because you can always take them using Revopush CLI.

### 3.2 Replicate Appcenter Deployments in Revopush

Revopush allows you to create multiple deployments for each application with the same deployment keys as you have in Appcenter.
The reason for that is that these keys are treated as a sort of secrets (for instance these can be used in your CI/CD pipeline, 
environment variables on developer machine or build server, mobile app, etc). 
To reduce frictions in migration process and make the process as smooth as possible 
we recommend you to reuse these keys in Revopush deployments.

In examples below we assume you have 2 deployments in Appcenter for every app: `Staging` and `Production`. 
Actual number of deployments can be different in your case but idea is the same - re-create these with identical keys in Revopush.

Run the following command:

#### iOS

```shell
  appcenter codepush deployment list -k -a johndoe/rn2_ios
```

which will display something like this:
```shell
┌────────────┬────────────────────────────────────────┐
│ Name       │ Key                                    │
├────────────┼────────────────────────────────────────┤
│ Production │ xJeOl4A5No7c9-wJv8HLj1ktmmKeP5awD0us5u │
├────────────┼────────────────────────────────────────┤
│ Staging    │ ZFZiSAKLUL_QmBXeWAcSkpv87fkaDeWu1W0TOs │
└────────────┴────────────────────────────────────────┘
```

Add Revopush deployment for iOS with the same keys running command to replicate Staging
```shell
revopush deployment add rn2_ios appcenter_Staging -k ZFZiSAKLUL_QmBXeWAcSkpv87fkaDeWu1W0TOs
```

and the following command to replicate Production
```shell
revopush deployment add rn2_ios appcenter_Production -k xJeOl4A5No7c9-wJv8HLj1ktmmKeP5awD0us5u
```

where: 
- `rn2_ios` is the application name in Revopush
- `appcenter_Staging` and `appcenter_Production` are the deployment names in Revopush (the same as in Appcenter but for sake of clarity we added `appcenter_` prefix)
- `ZFZiSAKLUL_QmBXeWAcSkpv87fkaDeWu1W0TOs` is the deployment key for `Staging` in Appcenter
- `xJeOl4A5No7c9-wJv8HLj1ktmmKeP5awD0us5u` is the deployment key for `Production` in Appcenter

Help tip:
Until you switched your mobile application to use Revopush (more about this below) or during testing it's totally fine to delete the deployment in Revopush.

To delete deployment if you need run the following command:

```shell
revopush deployment rm rn2_ios appcenter_Staging
````

#### Android

For Android app steps are very similar except different app name. List deployments in Appcenter:

```shell
appcenter codepush deployment list -k -a johndoe/rn2_android
```

with output like this:
```shell
┌────────────┬────────────────────────────────────────┐
│ Name       │ Key                                    │
├────────────┼────────────────────────────────────────┤
│ Production │ PQPwJaW63MTPI8T__u168qJm7Vq7Mn0UJ94MMR │
├────────────┼────────────────────────────────────────┤
│ Staging    │ 4tK3WlLhumcwaukx68Irq04XqS_3R4H6N-lV-z │
└────────────┴────────────────────────────────────────┘
```

Add Revopush Android Staging deployment
```shell
revopush deployment add rn2_android appcenter_Staging -k 4tK3WlLhumcwaukx68Irq04XqS_3R4H6N-lV-z
```

Add Revopush Android Production deployment

```shell
revopush deployment add rn2_android appcenter_Production -k PQPwJaW63MTPI8T__u168qJm7Vq7Mn0UJ94MMR
```

where:
- `rn2_android` is the application name in Revopush
- `appcenter_Staging` and `appcenter_Production` are the deployment names in Revopush (the same as in Appcenter but for sake of clarity we added `appcenter_` prefix)
- `4tK3WlLhumcwaukx68Irq04XqS_3R4H6N-lV-z` is the deployment key for `Staging` in Appcenter
- `PQPwJaW63MTPI8T__u168qJm7Vq7Mn0UJ94MMR` is the deployment key for `Production` in Appcenter

Repeat for all other deployment you have in Appcenter and wish to continue to use in Revopush.

## 4. Create Application and Deployments in Revopush

You need to execute steps in this section if you start from scratch and wish to apply OTA on top of Revopush for your app.
People who migrate from Appcenter to Revopush can skip this section (we have done all what we need in previous sections) 
and go to section 5.

It empowers you to use the best practices of [Multi-Deployment Testing](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-deployment)
and have isolated app for iOS and Android each with few Deployments (at least `Staging` and `Production`).


### 4.1 Login to Revopush CLI

Execute the following command to login to Revopush CLI using provider of your choice (GitHub, Google):

```shell
  revopush login
```

### 4.2 Create applications in Revopush

Revopush does not specify the target platform of the application at the moment of creation. 
To later easy manage them we suggest to give them meaningful names which will contain platform as a part of it. 

#### iOS

```shell
revopush app add myAmazingApp_ios
```

with response like

```shell
Successfully added the "myAmazingApp_ios" app, along with the following default deployments:
┌────────────┬────────────────────────────────────────┐
│ Name       │ Deployment Key                         │
├────────────┼────────────────────────────────────────┤
│ Production │ PRer2J8xeLerKNZ16Klsf5yfdc8uVJHvdy5W-g │
├────────────┼────────────────────────────────────────┤
│ Staging    │ vUOFPtZfOlhXHPEDE3nkf7nP6lJ4VJHvdy5W-g │
└────────────┴────────────────────────────────────────┘
````

#### Android

```shell
revopush app add myAmazingApp_android
```

with response like
```shell
Successfully added the "myAmazingApp_android" app, along with the following default deployments:
┌────────────┬────────────────────────────────────────┐
│ Name       │ Deployment Key                         │
├────────────┼────────────────────────────────────────┤
│ Production │ I0N9-8MCI-JAAmlrbjGRROGFFFvtVJHvdy5W-g │
├────────────┼────────────────────────────────────────┤
│ Staging    │ kbAXqSrgEfLPcuvU3Fe0SCqX5HpOVJHvdy5W-g │
└────────────┴────────────────────────────────────────┘
````

### 4.3 Create deployments in Revopush

In addition to two deployments we create out of the box you may need to have more for your application (eg for development, testing).

The following command will create a new deployment for the application you have created:

```shell
revopush deployment add myAmazingApp_android Development
```

with response like
```shell
Successfully added the "Development" deployment with key "7Eh9BWf9FIr4_d33ay_oj4zeVoYqVJHvdy5W-g" to the "myAmazingApp_android" app.
```

To list all the deployments with their keys for the application run the following command:

```shell
revopush deployment ls myAmazingApp_android -k
```

which will display something like this:

```shell
┌─────────────┬────────────────────────────────────────┬─────────────────────┬──────────────────────┐
│ Name        │ Deployment Key                         │ Update Metadata     │ Install Metrics      │
├─────────────┼────────────────────────────────────────┼─────────────────────┼──────────────────────┤
│ Development │ 7Eh9BWf9FIr4_d33ay_oj4zeVoYqVJHvdy5W-g │ No updates released │ No installs recorded │
├─────────────┼────────────────────────────────────────┼─────────────────────┼──────────────────────┤
│ Production  │ D32ZXaQ-JybAzpLIiwZaNqh2XgLRVJHvdy5W-g │ No updates released │ No installs recorded │
├─────────────┼────────────────────────────────────────┼─────────────────────┼──────────────────────┤
│ Staging     │ siXHHg5Pq1eFzFBdHKSMl23dqdxpVJHvdy5W-g │ No updates released │ No installs recorded │
└─────────────┴────────────────────────────────────────┴─────────────────────┴──────────────────────┘
```

## 5. Migrate your React Native application to Revopush OTA

The way how check for updates happens (eg on every app start, or fine-grained control involving user) 
as well as when bundle is installed (eg immediately, on next restart or on next resume) heavy depends on 
your application requirements and used version of React Native and CodePush plugin.

Please refer to official documentation of [react-native-code-push](https://github.com/microsoft/react-native-code-push/tree/master?tab=readme-ov-file#plugin-usage) 
plugin to find an approach which will fit your needs. 

At this point we assume you have already applied CodePush plugin on React side and completed setup of native modules 
( [iOS](https://github.com/microsoft/react-native-code-push/blob/master/docs/setup-ios.md),
[Android](https://github.com/microsoft/react-native-code-push/blob/master/docs/setup-android.md))

Below are steps to be done for iOS and Android to switch CodePush server location from Appcenter to Revopush.

### 5.1 Update CodePush server URL for iOS

Open your app's `Info.plist` file and add a new entry named `CodePushServerURL` whose value is the URL of the Revopush API server.

```xml
<key>CodePushServerURL</key>
<string>https://api.revopush.org</string>
```

Also be sure you do have an entry named `CodePushDeploymentKey` whose value is the key of the deployment you want to configure this app against
(see section above how to get Deployment Key ). 

```xml
<key>CodePushDeploymentKey</key>
<string>vUOFPtZfOlhXHPEDE3nkf7nP6lJ4VJHvdy5W-g</string>
```

As result for our `myAmazingApp_ios` app and `Staging` deployment `Info.plist` section related to CodePush will look like this:

```xml
<key>CodePushDeploymentKey</key>
<string>vUOFPtZfOlhXHPEDE3nkf7nP6lJ4VJHvdy5W-g</string>
<key>CodePushServerURL</key>
<string>https://api.revopush.org</string>
```

_Note: If you need to dynamically use a different deployment, you can also override your deployment key in JS code using
[Code-Push options](https://github.com/microsoft/react-native-code-push/blob/master/docs/api-js.md#CodePushOptions)_

### 5.2 Update CodePush server URL for Android

Open your app's `strings.xml` file and add a new entry named `CodePushServerUrl` whose value is the URL of the Revopush API server.

```xml
<string moduleConfig="true" name="CodePushServerUrl">https://api.revopush.org</string>
```

Also be sure you do have an entry named `CodePushDeploymentKey` whose value is the key of the deployment you want to configure this app against
(see section above how to get Deployment Key ).

```xml
<string moduleConfig="true" name="CodePushDeploymentKey">kbAXqSrgEfLPcuvU3Fe0SCqX5HpOVJHvdy5W-g</string>
```

As result for our `myAmazingApp_android` app and `Staging` deployment `strings.xml` section related to CodePush will look like this:

```xml
<string moduleConfig="true" name="CodePushDeploymentKey">kbAXqSrgEfLPcuvU3Fe0SCqX5HpOVJHvdy5W-g</string>
<string moduleConfig="true" name="CodePushServerUrl">https://api.revopush.org</string>
```

_Note: If you need to dynamically use a different deployment, you can also override your deployment key in JS code using
[Code-Push options](https://github.com/microsoft/react-native-code-push/blob/master/docs/api-js.md#CodePushOptions)_


## 6. Release updates

Once your app is configured and distributed to your users, and you have made some JS or asset changes, it's time to release them.

Note: For Appcenter users most of the commands in Revopush CLI will look familiar or even identical. For your convenience we will show you 
how to release updates for both platforms so you would adjust your scripts, CI/CD pipelines, etc if any.

### 6.1 Release updates for iOS

To push a bundle for iOS to the `Staging` deployment of the `rn2_ios` app, run the following command:

```shell
revopush release-react rn2_ios ios -d Staging
```

Under the hood, this command will run `react-native bundle` command to create a bundle and assets,
then upload them to Revopush server and release the update to the `Staging` deployment of the `rn2_ios` app.

Upon successful release, you will see something like this:

```shell
Detecting ios app version:

Using the target binary version value "0.0.1" from "ios/rn2/Info.plist".

Running "react-native bundle" command:

node node_modules/react-native/cli.js bundle --assets-dest /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush --bundle-output /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush/main.jsbundle --dev false --entry-file index.js --platform ios
Welcome to Metro v0.81.0
              Fast - Scalable - Integrated

info Writing bundle output to: /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush/main.jsbundle
info Done writing bundle output
info Copying 1 asset files
info Done copying assets
private key was not provided

Releasing update contents to CodePush:

Upload progress:[==================================================] 100% 0.0s
Successfully released an update containing the "/var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush" directory to the "Staging" deployment of the "rn2_ios" app.
```

where:
- `rn2_ios` is the application name in Revopush
- `Staging` is the deployment name in Revopush
- `ios` is the target platform

The entire list of available options such as bundle name, entry file, whether this release should be considered mandatory,
rercentage of users this release should be immediately available to and many others for the `release-react` command can be found in CLI

```shell
revopush release-react -h
```

### 6.2 Release updates for Android

To push a bundle for Android to the `appcenter-Staging` deployment of the `rn2_android` app, run the following command:

```shell
revopush release-react rn2_android android -d appcenter-Staging
```

Under the hood, this command will run `react-native bundle` command to create a bundle and assets, then upload them to Revopush server and release the update to the `Staging` deployment of the `rn2_android` app.

Upon successful release, you will see something like this:

```shell
Detecting android app version:

Using the target binary version value "1.0" from "android/app/build.gradle".

Running "react-native bundle" command:

node node_modules/react-native/cli.js bundle --assets-dest /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush --bundle-output /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush/index.android.bundle --dev false --entry-file index.js --platform android
Welcome to Metro v0.81.0
              Fast - Scalable - Integrated

info Writing bundle output to: /var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush/index.android.bundle
info Done writing bundle output
info Copying 1 asset files
info Done copying assets
private key was not provided

Releasing update contents to CodePush:

Upload progress:[==================================================] 100% 0.0s
Successfully released an update containing the "/var/folders/my/lwrczz7503g5911_wf51jsvm0000gp/T/CodePush" directory to the "appcenter-Staging" deployment of the "rn2_android" app.
```

where:
- `rn2_android` is the application name in Revopush
- `appcenter-Staging` is the deployment name in Revopush
- `android` is the target platform

The entire list of available options such as bundle name, entry file, whether this release should be considered mandatory,
rercentage of users this release should be immediately available to and many others for the `release-react` command can be found in CLI 

```shell
revopush release-react -h
```

### 6.3 Release history

The release history for deployment of the app can be viewed in Revopush UI or if you prefer CLI by running the following command:

```shell
revopush deployment history rn2_ios Staging
```

with response like

```shell
┌───────┬───────────────┬─────────────┬───────────┬─────────────┬──────────────────────┐
│ Label │ Release Time  │ App Version │ Mandatory │ Description │ Install Metrics      │
├───────┼───────────────┼─────────────┼───────────┼─────────────┼──────────────────────┤
│ v1    │ 8 minutes ago │ 0.0.1       │ No        │             │ No installs recorded │
└───────┴───────────────┴─────────────┴───────────┴─────────────┴──────────────────────┘
```

## 7. Summary

At Revopush we tried to make the migration process as smooth as possible.
For experienced developers who have been using Appcenter CLI for OTA updates, 
commands in Revopush CLI will look familiar or even identical.

For your convenience we created a table with the most common commands you may need to use in Revopush CLI 
(with their analogs in Appcenter CLI):

| Appcenter                        | Revopush               |                                                                     Comment                                                                      | 
|:---------------------------------|:-----------------------|:------------------------------------------------------------------------------------------------------------------------------------------------:|
| appcenter login                  | revopush login         |                                                                      Log in                                                                      |
| appcenter codepush deployment    | revopush deployment    |                                                       View and manage your app deployments                                                       |
| appcenter apps                   | revopush app           |                                                            View and manage your apps                                                             |
| appcenter codepush patch         | revopush patch         |                                               Update the metadata for an existing CodePush release                                               |
| appcenter codepush promote       | revopush promote       | Create a new release for the destination deployment, which includes the exact code and metadata from the latest release of the source deployment |
| appcenter codepush release-react | revopush release-react |                                                Release a React Native update to an app deployment                                                |
| appcenter codepush rollback      | revopush rollback      |                                                   Rollback a deployment to a previous release                                                    |
| appcenter logout                 | revopush logout        |                                                                     Log out                                                                      |

### Resources which maybe helpful:
- React Native CodePush [GitHub](https://github.com/microsoft/react-native-code-push)
- React Native Client SDK [docs](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-overview)
- Best practices for [Multi-Deployment Testing](https://learn.microsoft.com/en-us/appcenter/distribution/codepush/rn-deployment)

We hope this guide will help you to migrate your OTA updates from Appcenter to Revopush and start using the new features we provide.
Your questions, feedback, and suggestions are always welcome. Please feel free to reach out to us at support@revopush.org
