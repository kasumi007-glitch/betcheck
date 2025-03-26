declare module "puppeteer-extra-plugin-stealth" {
  import { PuppeteerExtraPlugin } from "puppeteer-extra";

  // Minimal declaration for the stealth plugin.
  class StealthPlugin implements PuppeteerExtraPlugin {
    public name: string;
    public _isPuppeteerExtraPlugin: boolean;
    constructor();
    getOptions?(): any;
    // Include any additional members as needed
  }

  // The default export is a function that returns an instance of StealthPlugin.
  export default function (): StealthPlugin;
}
