import { registerAssetSchemaDriver } from "./driver";
import { V1_DSL_ASSET_DRIVER } from "./drivers/v1-dsl";
import { V2_PRIMITIVE_ASSET_DRIVER } from "./drivers/v2-primitive";

// 기본 내장 v1/v2 A/B 스키마 드라이버 자동 등록
registerAssetSchemaDriver(V1_DSL_ASSET_DRIVER);
registerAssetSchemaDriver(V2_PRIMITIVE_ASSET_DRIVER);

export * from "./types";
export * from "./validator";
export * from "./extract";
export * from "./seed-assets";
export * from "./driver";
export * from "./ranking";
export * from "./drivers/v1-dsl";
export * from "./drivers/v2-primitive";
