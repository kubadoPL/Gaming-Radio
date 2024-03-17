//
//  LEANRegexRulesManager.h
//  GoNativeIOS
//
//  Created by bld ai on 6/14/22.
//  Copyright © 2022 GoNative.io LLC. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "LEANWebViewController.h"

@interface LEANRegexRulesManager : NSObject
- (instancetype)initWithWvc:(LEANWebViewController *)wvc;
- (void)handleUrl:(NSURL *)url query:(NSDictionary*)query;
- (BOOL)shouldHandleRequest:(NSURLRequest *)request;
@end
