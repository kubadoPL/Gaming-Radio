//
//  LEANKeyboardManager.h
//  MedianIOS
//
//  Created by bld on 9/25/23.
//  Copyright © 2023 GoNative.io LLC. All rights reserved.
//

#import <WebKit/WebKit.h>

@interface LEANKeyboardManager : NSObject
+ (LEANKeyboardManager *)shared;
- (void)setTargetWebview:(WKWebView *)webView;
- (void)showKeyboardAccessoryView:(BOOL)visible;
@end

@interface _LEANNoInputAccessoryView : NSObject
@end
