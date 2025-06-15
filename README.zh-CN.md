# 简介
这是一个为Qt+cpp项目提供类似Qtcreator的资源管理器视图的扩展。原理是通过解析特定构建系统的构建结果和Qt资源文件.qrc来解析出文件结构。目前支持CMake，预计后面会添加qmake和XMake支持，并且添加对.qrc文件的相关支持。
# 注意事项
- 首次使用时，可能需要在侧边栏-资源管理器-右上角的三个点，单击启用Qt File Explorer。
- 由于解析逻辑依赖于构建结果，所以必须要有构建结果并且设定了合适的构建目录，才能得到正确的文件结构。
- 有些文件夹图标是空心的，比如Header Files，说明这不是实际的目录，而是根据解析结果创建的虚拟目录，实心的或者和你的文件图标主题一致的，说明是真实存在的目录。而.qrc文件虽然使用的是文件图标，但是可以折叠/展开，需要打开编辑的话使用右键菜单。
# 推荐扩展
- ms-vscode.cpptools - 用于提供C++语言支持
- theqtcompany.qt - Qt支持
- ms-vscode.cmake-tools - CMake支持
- tboox.xmake-vscode - XMake支持
# 引用
- [Qtcreator项目的github地址](https://github.com/qt-creator/qt-creator) - 参考解析CMake逻辑
