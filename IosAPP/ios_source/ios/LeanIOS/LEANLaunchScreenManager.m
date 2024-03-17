//
//  LEANLaunchScreenManager.m
//  Median
//
//  Created by bld on 8/11/23.
//  Copyright © 2023 Median. All rights reserved.
//

#import "LEANLaunchScreenManager.h"
#import "GonativeIO-Swift.h"

@interface LEANLaunchScreenManager()
@property UIImageView *launchScreen;
@property BOOL isShown;
@end

@implementation LEANLaunchScreenManager

+ (LEANLaunchScreenManager *)sharedManager {
    static LEANLaunchScreenManager *shared;
    @synchronized(self) {
        if (!shared) {
            shared = [[LEANLaunchScreenManager alloc] init];
        }
        return shared;
    }
}

- (void)show {
    if (!self.isShown) {
        self.isShown = YES;
        
        self.launchScreen = [[UIImageView alloc] initWithFrame:UIScreen.mainScreen.bounds];
        self.launchScreen.image = [UIImage imageNamed:@"LaunchBackground"];
        self.launchScreen.clipsToBounds = YES;
        
        UIImageView *centerImageView = [[UIImageView alloc] initWithFrame:CGRectMake(0, 0, 200, 400)];
        centerImageView.image = [UIImage imageNamed:@"LaunchCenter"];
        centerImageView.contentMode = UIViewContentModeScaleAspectFit;
        centerImageView.center = CGPointMake(self.launchScreen.bounds.size.width / 2, self.launchScreen.bounds.size.height / 2);
        [self.launchScreen addSubview:centerImageView];
        
        UIWindow *currentWindow = [UIApplication sharedApplication].currentKeyWindow;
        [currentWindow addSubview:self.launchScreen];
    }
}

- (void)hide {
    if (self.launchScreen) {
        [self.launchScreen removeFromSuperview];
        self.launchScreen = nil;
    }
}

- (void)hideAfterDelay:(double)delay {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self hide];
    });
}

@end
