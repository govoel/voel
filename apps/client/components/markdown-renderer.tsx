import { Image } from 'expo-image';
import React, { ReactNode } from 'react';
import { TouchableHighlight, View } from 'react-native';
import { Linking } from 'react-native';
import { Renderer } from 'react-native-marked';
import type { RendererInterface } from 'react-native-marked';

import { Text } from '~/components/ui/text';

const onLinkPress = (url: string) => () => {
  Linking.openURL(url)
    .then(() => null)
    .catch((e) => {
      console.warn("URL can't be opened", e);
    });
};

class CustomRenderer extends Renderer implements RendererInterface {
  paragraph(children: ReactNode[]): ReactNode {
    return this._getViewNode(children, 'pb-2');
  }

  hr(): ReactNode {
    return this._getViewNode(null, 'border-b');
  }

  listItem(children: ReactNode[]): ReactNode {
    return this._getViewNode(children, 'pl-4');
  }

  escape(text: string): ReactNode {
    return this._getTextNode(text);
  }

  link(children: string | ReactNode[], href: string): ReactNode {
    return (
      <Text
        selectable
        accessibilityRole="link"
        accessibilityHint="Opens in a new window"
        key={this.getKey()}
        onPress={onLinkPress(href)}
        className="underline">
        {children}
      </Text>
    );
  }

  image(uri: string, alt?: string): ReactNode {
    const key = this.getKey();
    if (uri.endsWith('.svg')) {
      return <Image source={{ uri }} key={key} />;
    }
    return <Image key={key} source={{ uri }} alt={alt} />;
  }

  strong(children: string | ReactNode[]): ReactNode {
    return this._getTextNode(children, 'group font-bold group-[.font-italic]:font-bolditalic');
  }

  em(children: string | ReactNode[]): ReactNode {
    return this._getTextNode(children, 'group font-italic group-[.font-bold]:font-bolditalic');
  }

  br(): ReactNode {
    return this._getTextNode('\n');
  }

  text(text: string | ReactNode[]): ReactNode {
    return this._getTextNode(text);
  }

  html(text: string | ReactNode[]): ReactNode {
    return this._getTextNode(text);
  }

  linkImage(href: string, imageUrl: string, alt?: string): ReactNode {
    const imageNode = this.image(imageUrl, alt);
    return (
      <TouchableHighlight
        accessibilityRole="link"
        accessibilityHint="Opens in a new window"
        onPress={onLinkPress(href)}
        key={this.getKey()}>
        {imageNode}
      </TouchableHighlight>
    );
  }

  private _getTextNode(children: string | ReactNode[], className?: string): ReactNode {
    return (
      <Text selectable key={this.getKey()} className={className}>
        {children}
      </Text>
    );
  }

  private _getViewNode(children: ReactNode[] | null, className?: string): ReactNode {
    return (
      <View key={this.getKey()} className={className}>
        {children}
      </View>
    );
  }

  private _getBlockquoteNode(children: ReactNode[], className?: string): ReactNode {
    return (
      <View key={this.getKey()} className={className}>
        {children}
      </View>
    );
  }
}

export const renderer = new CustomRenderer();
