# **Resolving tauri.conf.json Error with withGlobalTauri in Tauri Development**

The execution of the tauri dev command has resulted in an error message indicating an issue within the tauri.conf.json file. Specifically, the error states that "Additional properties are not allowed ('withGlobalTauri' was unexpected)" within the build section of the configuration file. This report aims to clarify the correct placement and usage of the withGlobalTauri property, particularly within the context of different Tauri versions, and to guide users toward the appropriate method for accessing Tauri's functionalities in their frontend applications.

The tauri.conf.json file serves as the central configuration hub for a Tauri application.1 It dictates a wide array of application behaviors, ranging from build processes and application metadata to security protocols and user interface settings. The reported error, "Additional properties are not allowed," signifies that the configuration schema for the build section in the currently used Tauri version does not recognize withGlobalTauri as a valid parameter.1 This discrepancy between the configured property and the expected schema suggests a potential mismatch in the intended configuration structure for the specific Tauri version being utilized. Over time, as frameworks evolve, their configuration structures often undergo revisions to enhance organization and accommodate architectural changes. This error strongly implies that the withGlobalTauri property might have been relocated or its usage modified in the version of Tauri the user is employing.

The primary function of the withGlobalTauri property is to determine whether the Tauri JavaScript API is injected into the global scope of the frontend environment, specifically under the window.\_\_TAURI\_\_ object.3 When this property is set to true, developers can directly access Tauri's native capabilities from their frontend code. This includes functionalities like interacting with the file system, accessing operating system-level features, and invoking custom backend commands defined in the Rust code. This global availability offers a seemingly straightforward method for frontend developers to leverage the power of Tauri's native integrations within their web-based user interfaces.

Historically, within Tauri version 1, the withGlobalTauri property was indeed located within the build section of the tauri.conf.json file.5 In this earlier version, a typical configuration might have included the withGlobalTauri setting directly under the build object, as exemplified by the user's provided configuration snippet. Developers familiar with Tauri v1 might naturally expect this configuration to remain valid in subsequent versions. However, with the advent of Tauri version 2, a significant reorganization of the configuration structure was introduced. The withGlobalTauri property was moved from the build section to the app section of the tauri.conf.json file.3 A GitHub issue 8 reports a user encountering the same error, thereby corroborating this relocation. The discussion within this issue also references a migration script, further indicating that this change was an intentional part of the version 2 update. This migration script likely aimed to automate the process of updating configurations for users transitioning from v1 to v2, specifically addressing the movement of properties like withGlobalTauri. Furthermore, a GitHub discussion 9 explicitly points out that in Tauri v2, the withGlobalTauri setting should reside within the app block. The official Tauri v2 configuration reference 3 clearly lists withGlobalTauri as a property within the app configuration, with a default value of false. A valid tauri.conf.json example for v2 10 also demonstrates withGlobalTauri: true placed within the app section. While the aforementioned GitHub issue 8 also mentions an instance where placing withGlobalTauri within a tauri section (the former name of the app section) was also not accepted, and this issue was later closed, it is crucial to prioritize the guidance provided by the latest official documentation and stable releases. This closed issue might have been indicative of a bug in an earlier, less stable version of v2 or a specific edge case.

The official Tauri v2 documentation regarding the withGlobalTauri property 3 elucidates that while setting this property to true within the app section will indeed enable global access to the Tauri API, the recommended approach in Tauri v2 is to set it to false (which is the default value) and instead import the necessary Tauri modules directly into the frontend code from the @tauri-apps/api npm package. This shift towards explicit imports is intended to foster better modularity within frontend applications. By requiring developers to specifically import the Tauri functions they intend to use, frontend bundlers like Webpack, Parcel, or Vite can perform more effective tree-shaking. Tree-shaking is an optimization technique that eliminates unused code from the final application bundle, leading to potentially smaller application sizes and improved performance. The documentation provides a clear example illustrating this recommended approach 3:

JavaScript

// Recommended approach in Tauri v2  
import { platform } from '@tauri-apps/api/os';

async function getOsType() {  
  const os \= await platform();  
  console.log(\`Operating system: ${os}\`);  
}

getOsType();

This preference for explicit imports aligns with modern frontend development best practices, where modularity and clearly defined dependencies contribute to more maintainable, readable, and optimized codebases.

In Tauri v2, the tauri.conf.json file typically exhibits a structure where build-related configurations are logically separated from application-specific settings.1 A fundamental structure for v2 would resemble the following:

JSON

{  
  "build": {  
    "beforeBuildCommand": "",  
    "beforeDevCommand": "",  
    "devUrl": "http://localhost:3000",  
    "frontendDist": "../dist"  
  },  
  "package": {  
    "productName": "Tauri App",  
    "version": "0.1.0"  
  },  
  "app": {  
    "security": {  
      "csp": null  
    },  
    "windows": \[  
      //... window configurations  
    \],  
    "withGlobalTauri": false // or true, if global access is preferred  
  },  
  "bundle": {  
    //... bundle configurations  
  },  
  "plugins": {  
    //... plugin configurations  
  }  
}

The build section 3 is now primarily focused on configuring the mechanics of the build process itself. This includes specifying shell commands to be executed before the development or production build, defining the URL for the development server, and indicating the location of the finalized frontend assets. The app section 3, on the other hand, houses configurations that pertain to the application's behavior and settings, such as security policies, window configurations, and, crucially, the withGlobalTauri property. This segregation of concerns enhances the overall organization and clarity of the configuration file, making it easier for developers to locate and modify specific settings as needed.

To resolve the user's encountered error and to enable global access to the Tauri API if that is the desired outcome, the following steps are recommended:

First, it is essential to ascertain the specific version of Tauri being used in the project. This information can typically be found within the Cargo.toml file located in the src-tauri directory of the project. Regardless of the Tauri version, the withGlobalTauri property must be removed from the build section of the tauri.conf.json file. For users on Tauri v1 (though the reported error strongly suggests v2), they should verify that withGlobalTauri is correctly spelled and positioned within the build section. If the error persists, it indicates the presence of other potential configuration issues. For users on Tauri v2, there are two primary approaches: the recommended method involves setting (or ensuring) that withGlobalTauri is either absent from the app section or explicitly set to false. Subsequently, in their frontend JavaScript or TypeScript code, they should import the specific Tauri functions they require from the @tauri-apps/api package. Alternatively, if the user wishes to retain the convenience of accessing the Tauri API through the global window.\_\_TAURI\_\_ object, they should add the following configuration to the app section of their tauri.conf.json:

JSON

"app": {  
  "withGlobalTauri": true,  
  //... other app configurations  
}

It is also crucial to double-check for any typographical errors in the property name (withGlobalTauri) or the section name (app or build). Finally, it is always advisable for users to consult the official Tauri documentation that corresponds to their specific Tauri version. The official documentation serves as the most reliable and up-to-date source of information regarding configuration details and best practices.2

| Tauri Version | Configuration Section | Property Name | Default Value | Recommended Approach |
| :---- | :---- | :---- | :---- | :---- |
| v1 | build | withGlobalTauri | true | Global window.\_\_TAURI\_\_ object |
| v2 | app | withGlobalTauri | false | Import specific APIs from @tauri-apps/api (default) |
| v2 (Legacy) | app | withGlobalTauri | true | Global window.\_\_TAURI\_\_ object (if explicitly set) |

In conclusion, the error encountered by the user, "Additional properties are not allowed ('withGlobalTauri' was unexpected)" within the build section of tauri.conf.json, primarily stems from changes introduced in Tauri v2. In this newer version, the withGlobalTauri property has been relocated to the app section. While enabling global access to the Tauri API remains an option in v2 by setting withGlobalTauri: true within the app configuration, the recommended practice is to adopt a more modular approach by setting this property to false (or omitting it) and explicitly importing the necessary Tauri APIs from the @tauri-apps/api package in the frontend code. This approach promotes better code organization and potential performance benefits through tree-shaking. It is strongly recommended that the user identify their Tauri version, remove the withGlobalTauri property from the build section, and then either configure it within the app section as needed or, preferably, transition to using explicit imports as suggested by the Tauri v2 documentation. Consulting the official documentation for their specific Tauri version will provide the most accurate and comprehensive guidance for resolving this configuration issue.

#### **Works cited**

1. Configuration | Tauri Apps, accessed April 3, 2025, [https://tauri.app/v1/api/config](https://tauri.app/v1/api/config)  
2. Configuration Files \- Tauri 2.0, accessed April 3, 2025, [https://v2.tauri.app/develop/configuration-files/](https://v2.tauri.app/develop/configuration-files/)  
3. Configuration | Tauri, accessed April 3, 2025, [https://v2.tauri.app/reference/config/](https://v2.tauri.app/reference/config/)  
4. Configuration Files | Tauri Apps, accessed April 3, 2025, [https://tauri.app/v1/references/configuration-files](https://tauri.app/v1/references/configuration-files)  
5. event | Tauri Apps, accessed April 3, 2025, [https://tauri.app/v1/api/js/event](https://tauri.app/v1/api/js/event)  
6. app | Tauri Apps, accessed April 3, 2025, [https://tauri.app/v1/api/js/app](https://tauri.app/v1/api/js/app)  
7. Tauri Apps \- tauri, accessed April 3, 2025, [https://tauri.app/v1/api/js/tauri/](https://tauri.app/v1/api/js/tauri/)  
8. \[docs\] withGlobalTauri build option deprecated · Issue \#9248 · tauri-apps/tauri \- GitHub, accessed April 3, 2025, [https://github.com/tauri-apps/tauri/issues/9248](https://github.com/tauri-apps/tauri/issues/9248)  
9. I can find window.\_\_TAURI\_INTERNALS\_\_.invoke but not window.\_\_TAURI\_\_.invoke · tauri-apps tauri · Discussion \#11586 \- GitHub, accessed April 3, 2025, [https://github.com/tauri-apps/tauri/discussions/11586](https://github.com/tauri-apps/tauri/discussions/11586)  
10. tauri/examples/state/tauri.conf.json at dev \- GitHub, accessed April 3, 2025, [https://github.com/tauri-apps/tauri/blob/dev/examples/state/tauri.conf.json](https://github.com/tauri-apps/tauri/blob/dev/examples/state/tauri.conf.json)