//
//  LEANWindowManager.h
//  MedianIOS
//
//  Created by bld on 2/9/24.
//  Copyright © 2024 GoNative.io LLC. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "LEANWebViewController.h"

@interface LEANWindowsManager : NSObject
- (instancetype)initWithWvc:(LEANWebViewController *)wvc;
- (void)openUrl:(NSURL *)url mode:(NSString *)mode;
@end
