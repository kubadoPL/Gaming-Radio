import webview

def get_elements(window):
    heading = window.get_elements('#heading')
    content = window.get_elements('.content')
    streamtitle = window.get_elements('#streamTitle')  # Fix: Add '#' before 'streamTitle'
    print('Heading:\n %s ' % heading[0]['outerHTML'])
    print('Content 1:\n %s ' % content[0]['outerHTML'])
    print('Content 2:\n %s ' % content[1]['outerHTML'])
    print('Content 2:\n %s ' % streamtitle[0]['outerHTML'])

if __name__ == '__main__':
    html = """
      <html>
        <body>
          <h1 id="heading">Heading</h1>
          <div class="content">Content 1</div>
          <div class="content">Content 2</div>
          <div id="streamTitle"> syf</div>
        </body>
      </html>
    """
    window = webview.create_window('Get elements example', html=html)
    webview.start(get_elements, window, debug=True)
