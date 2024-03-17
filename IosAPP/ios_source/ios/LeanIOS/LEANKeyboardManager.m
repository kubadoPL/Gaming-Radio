//
//  LEANKeyboardManager.m
//  Median
//
//  Created by bld on 9/25/23.
//  Copyright © 2023 GoNative.io LLC. All rights reserved.
//

#import "LEANKeyboardManager.h"
#import <objc/runtime.h>
#import <UIKit/UIKit.h>
#import "GonativeIO-Swift.h"

@interface LEANKeyboardManager()
@property Class noInputAccessoryViewClass;
@property UIView *noInputAccessoryView;
@end

@implementation LEANKeyboardManager

+ (LEANKeyboardManager *)shared {
    static LEANKeyboardManager *shared;
    @synchronized(self) {
        if (!shared) {
            shared = [[LEANKeyboardManager alloc] init];
        }
        return shared;
    }
}

- (void)setTargetWebview:(WKWebView *)webView {
    for (UIView *view in webView.scrollView.subviews) {
        if([[view.class description] hasPrefix:@"WKContent"]) {
            self.noInputAccessoryView = view;
        }
    }
}

- (void)showKeyboardAccessoryView:(BOOL)visible {
    if (!self.noInputAccessoryView) {
        return;
    }
    
    [UIApplication.sharedApplication.currentKeyWindow endEditing:YES];
    
    if (!visible) {
        self.noInputAccessoryViewClass = self.noInputAccessoryView.class;
        
        NSString *noInputAccessoryViewClassName = [NSString stringWithFormat:@"%@_NoInputAccessoryView", self.noInputAccessoryView.class.superclass];
        Class newClass = NSClassFromString(noInputAccessoryViewClassName);

        if(newClass == nil) {
            newClass = objc_allocateClassPair(self.noInputAccessoryView.class, [noInputAccessoryViewClassName cStringUsingEncoding:NSASCIIStringEncoding], 0);
            if(!newClass) {
                return;
            }

            Method method = class_getInstanceMethod([_LEANNoInputAccessoryView class], @selector(inputAccessoryView));
            class_addMethod(newClass, @selector(inputAccessoryView), method_getImplementation(method), method_getTypeEncoding(method));
            objc_registerClassPair(newClass);
        }
        
        object_setClass(self.noInputAccessoryView, newClass);
    }
    else if (self.noInputAccessoryViewClass) {
        object_setClass(self.noInputAccessoryView, self.noInputAccessoryViewClass);
    }
}

@end

@implementation _LEANNoInputAccessoryView

-(id)inputAccessoryView {
    return nil;
}

@end
