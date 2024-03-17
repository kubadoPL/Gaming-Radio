//
//  LEANWindowManager.m
//  Median
//
//  Created by Mahusai on 2/9/24.
//  Copyright © 2024 GoNative.io LLC. All rights reserved.
//

#import "LEANWindowsManager.h"
#import <SafariServices/SafariServices.h>
#import "GonativeIO-Swift.h"

@interface LEANWindowsManager()<SFSafariViewControllerDelegate>
@property (weak, nonatomic) LEANWebViewController *wvc;
@end

@implementation LEANWindowsManager

- (instancetype)initWithWvc:(LEANWebViewController *)wvc {
    self = [super init];
    if (self) {
        self.wvc = wvc;
    }
    return self;
}

- (void)openUrl:(NSURL *)url mode:(NSString *)mode {
    if ([mode isEqualToString:@"internal"]) {
        [self.wvc loadUrl:url];
        return;
    }
    
    if ([mode isEqualToString:@"appbrowser"]) {
        SFSafariViewController *vc = [[SFSafariViewController alloc] initWithURL:url];
        vc.delegate = self;
        [self.wvc presentViewController:vc animated:YES completion:nil];
        return;
    }
    
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
    });
}

#pragma mark - SFSafariViewControllerDelegate
- (void)safariViewControllerDidFinish:(SFSafariViewController *)controller {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self.wvc runJavascriptWithCallback:@"median_appbrowser_closed" data:nil];
    });
}

@end
