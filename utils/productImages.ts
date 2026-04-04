import { ImageSourcePropType } from "react-native";

export const dtmPacketImage: ImageSourcePropType = require("../assets/images/DtmPacket.png");
export const standerdPacketImage: ImageSourcePropType = require("../assets/images/StandardPacket.png");
export const gold500PacketImage: ImageSourcePropType = require("../assets/images/Gold500Packet.png");
export const bachaPacketImage: ImageSourcePropType = require("../assets/images/BachaPacket.jpg");
export const cowPacketImage: ImageSourcePropType = require("../assets/images/CowPacket.png");
export const chahPacketImage: ImageSourcePropType = require("../assets/images/ChahPacket.jpg");
export const gold1LPacketImage: ImageSourcePropType = require("../assets/images/Gold1LPacket.png");
export const chaiSpPacketImage: ImageSourcePropType = require("../assets/images/ChaiSpPacket.png");

const productNameToImageMap: Record<string, ImageSourcePropType> = {
  डीटीएम: dtmPacketImage,
  स्टैंडर्ड: standerdPacketImage,
  "गोल्ड 500": gold500PacketImage,
  बच्चा: bachaPacketImage,
  काउ: cowPacketImage,
  चाह: chahPacketImage,
  "गोल्ड 1 लीटर": gold1LPacketImage,
  "चाय स्पेशल": chaiSpPacketImage,
};

export const getProductImageSource = (options: {
  productName?: string | null;
  imageUrl?: string | null;
}): ImageSourcePropType | null => {
  if (!options) return null;

  const name = options.productName?.trim();
  if (name) {
    const normalized = name.toLowerCase();

    const matchedName = Object.keys(productNameToImageMap).find(
      (key) => key.toLowerCase() === normalized,
    );

    if (matchedName) {
      return productNameToImageMap[matchedName];
    }
  }

  if (options.imageUrl && options.imageUrl.trim().length > 0) {
    return { uri: options.imageUrl };
  }

  return null;
};
