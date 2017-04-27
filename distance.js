/**
 * @fileoverview 腾讯地图测距工具类，对外开放。
 * 用户可以创建新的测距实例，实现距离的测量。
 * 用户可以根据喜好自定义测距的相关样式。
 */
/**
 * 创建节点
 * @param {Object} tagName 标签名
 * @param {Object} obj 属性集合，eventArgus表示handle的参数
 * @param {Element} parent 指定父节点Dom元素
 */
function createNode(tagName, obj, parent) {
    var node = document.createElement(tagName || "div");
    if (obj) {
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) {
                if (attr == "children" ||
                    typeof obj[attr] === "function") {
                    continue;
                }
                switch (attr) {
                    case "cls":
                    case "className":
                        node.className = obj.cls || obj.className;
                        break;
                    case "innerHTML":
                    case "html":
                        node.innerHTML = obj.html || obj.innerHTML || '';
                        break;
                    case "style":
                        if (typeof obj.style === "string") {
                            var reg = /\s?([a-z\-]*)\:\s?([^;]*);?/gi,
                                sty;
                            while ((sty = reg.exec(obj.style)) != null) {
                                setStyle(node, sty[1], sty[2]);
                            }
                        } else {
                            setStyles(node, obj.style);
                        }
                        break;
                    case "handle":
                        var handle = obj.handle;
                        for (var eventName in handle) {
                            if (handle.hasOwnProperty(eventName)) {
                                Event.addDomListener(node, eventName,
                                    obj.handle[eventName]);
                            }
                        }
                        break;
                    default:
                        if (node.setAttribute) {
                            node.setAttribute(attr, obj[attr]);
                        } else {
                            node[attr] = obj[attr];
                        }
                }
            }
        }
    }
    if (parent) {
        parent.appendChild(node);
    }
    return node;
};

function setStyle(el, prop, value) {
    if (prop == 'opacity') {
        if (el.filters) {
            el.style.filter = "alpha(opacity=" + (value * 100) + ")";
        } else {
            el.style.opacity = value * 100 / 100;
        }
    } else {
        prop = toCamelCase(prop);
        if ((prop === "height" || prop === "width") &&
            parseInt(value, 10) < 0) {
            value = 0;
        }
        try {
            el.style[prop] = value;
        } catch (e) {}
    }
};

function setStyles(el, props) {
    for (prop in props) {
        if (props.hasOwnProperty(prop)) {
            setStyle(el, prop, props[prop]);
        }
    }
};

/**
 * 调整为驼峰格式的CSS名称
 * @param {String} str 样式名称
 * @returns 驼峰格式的CSS名称
 */
var toCamelCase = (function() {
    var cache = {};
    return function(str) {
        if (!cache[str]) {
            return (cache[str] = str
                .replace(/([A-Z]+)/g, function(m, l) {
                    return l.substr(0, 1).toUpperCase() +
                        l.toLowerCase().substr(1, l.length);
                })
                .replace(/[\-_\s](.)/g, function(m, l) {
                    return l.toUpperCase();
                }));
        } else {
            return cache[str];
        }
    };
})();
/**
 * MeasureDistance类的构造函数
 * 测距类，实现测距功能的入口。
 * 用户实例化该类后，即可调用该类提供的start方法开启测距状态。
 * @class
 * @name QQMapPlugin.MeasureDistance
 * @memberof QQMapPlugin
 * @param {Map} map qq.maps.Map类的实例
 */
function MeasureDistance(map) {
    /** @lends MeasureDistance.prototype */
    /**
     * @param {Map} map
     * map对象
     * @public
     */
    this.map = map;

    /**
     * 是否开启了测距状态
     * @type {boolean}
     * @private
     */
    this._isStart = false;

    this._displayArray = [];
}

/**
 * 开启地图的测距状态。
 * 使用MVC架构。
 * @function QQMapPlugin.MeasureDistance#start
 */
MeasureDistance.prototype.start = function(opts) {
    this.opts = opts ? opts : {};
    //当用户只点击了一次，没有确定结束点时，清空所有marker和polyline
    if (this._isStart && this._m && this._m.getLength() == 1) {
        this._c.end();
    }
    //已经启动测距状态
    if (this._isStart) {
        return;
    }
    this._isStart = true;
    //使用MVCArray类保存每次点击的latlng值
    this._m = new qq.maps.MVCArray();
    //实例化地图控制类MapController
    this._c = new MapController(this.map);
    //实例化展示类Display
    this._v = new Display(this._m, this.map);

    var self = this;
    /**
     * 私有数组保存注册的监听器
     * @type {Array}
     * @private
     */
    this._listenerArray = [];

    /**
     * 当有点击事件发生时触发
     */
    var listener1 = qq.maps.event.addListener(this._c, "add", function(latlng) {
        self._m.push(latlng);
        //隐藏开始提示label
        self._v.startLabel.setMap(null);
    });
    this._listenerArray.push(listener1);

    /**
     * 当光标在地图上移动时触发
     */
    var listener2 = qq.maps.event.addListener(this._c, "position_changed", function(latlng) {
        self._v.setCursorPosition(latlng);
        //显示鼠标动态label
        self._v.updateMoveLabel(latlng);
    });
    this._listenerArray.push(listener2);

    /**
     * 当结束测距时触发
     */
    var listener3 = qq.maps.event.addListener(this._c, "end", function() {
        self._isStart = false;
        self._v.end();
        self.opts.endCallback && self.opts.endCallback();
    });
    this._listenerArray.push(listener3);

    /**
     * 鼠标移动地图时触发，隐藏虚线
     * @type {*}
     */
    var listener4 = qq.maps.event.addListener(this._c, "mouseout", function() {
        self._v.hideCursorLine();
    });
    this._listenerArray.push(listener4);

    /**
     * 鼠标移入地图时触发，显示虚线
     * @type {*}
     */
    var listener5 = qq.maps.event.addListener(this._c, "mouseover", function() {
        self._v.showCursorLine();
    });
    this._listenerArray.push(listener5);

    //同时启动MapController的start方法
    this._c.start();
};
/**
 * 关闭地图的测距状态
 * @function QQMapPlugin.MeasureDistance#end
 */
MeasureDistance.prototype.end = function() {
    this.map.setOptions({
        draggableCursor: 'default'
    });

    this._displayArray.push(this._v);
    if (this._isStart) {
        this._c.end(this);
        this._c = null;
        this._m = null;
        this._v = null;

        //迭代注销监听器
        for (var i = 0, len = this._listenerArray.length; i < len; i++) {
            qq.maps.event.removeListener(this._listenerArray[i]);
            this._listenerArray[i] = null;
        }
        this._listenerArray = null;
    }
};

MeasureDistance.prototype.clear = function() {
    while (this._displayArray.length > 0) {
        var _v = this._displayArray.pop();
        _v && _v.clear();
        _v = null;
    }
};

/**
 * 将函数绑定到实例
 */
function bindHandler(handler, instance) {
    return function() {
        handler.apply(instance, arguments);
    }
}

/**
 * MapController类的构造函数,控制用户事件
 */
function MapController(map) {

    this.map = map;

    this.mask = new qq.maps.drawing.DrawingMask({
        cursor: "crosshair"
    });

    this._isStart = false;
}

/**
 * 由MeasureDistance的start调用，注册用户事件
 * @method start
 * @memberof MapController
 */
MapController.prototype.start = function() {
    this.mask.setMap(this.map);

    /**
     * 该数组保存注册的监听器
     */
    this.mylistenerArray = [];
    /**
     * 用户单击时触发，用于确定测距点
     */
    var mylistener1 = qq.maps.event.addListener(this.mask, 'click', bindHandler(this.onClick, this));
    this.mylistenerArray.push(mylistener1);
    /**
     * 用户移动鼠标时触发，用于跟随光标显示当前距离
     */
    var mylistener2 = qq.maps.event.addListener(this.mask, 'mousemove', bindHandler(this.onMouseMove, this));
    this.mylistenerArray.push(mylistener2);
    /**
     * 用户点击鼠标右键时触发，用于结束当前测距路径
     */
    var mylistener3 = qq.maps.event.addListener(this.mask, 'rightclick', bindHandler(this.onRightClick, this));
    this.mylistenerArray.push(mylistener3);
    /**
     * 用户双击时触发，用于结束当前测距路径
     */
    var mylistener4 = qq.maps.event.addListener(this.mask, 'dblclick', bindHandler(this.onDblClick, this));
    this.mylistenerArray.push(mylistener4);

    var mylistener5 = qq.maps.event.addListener(this.mask, "mouseout", bindHandler(this.onMouseOut, this));
    this.mylistenerArray.push(mylistener5);

    var mylistener6 = qq.maps.event.addListener(this.mask, "mouseover", bindHandler(this.onMouseOver, this));
    this.mylistenerArray.push(mylistener6);
};
/**
 * 由MeasureDistance的end调用，迭代删除监听器，并触发end事件给Display
 */
MapController.prototype.end = function() {
    for (var i = 0, len = this.mylistenerArray.length; i < len; i++) {
        qq.maps.event.removeListener(this.mylistenerArray[i]);
        this.mylistenerArray[i] = null;
    }
    this.mylistenerArray = null;
    this.mask.setMap(null);
    this._isStart = false;
    if (this._panByLisenter) {
        clearInterval(this._panByLisenter);
        this._panByLisenter = null;
    }
    qq.maps.event.trigger(this, "end");
};
/**
 * 当用户单击时，触发add事件给MeasureDistance
 */
MapController.prototype.onClick = function(evt) {
    this._isStart = true;
    qq.maps.event.trigger(this, "add", evt.latLng);
};
/**
 * 当用户移动鼠标时，触发position_changed事件给MeasureDistance
 */
MapController.prototype.onMouseMove = function(evt) {
    qq.maps.event.trigger(this, "position_changed", evt.latLng);
};
/**
 * 当用户右键时，调用实例的end方法，结束当前路径
 */
MapController.prototype.onRightClick = function() {
    //结束测距，改变鼠标样式为开启测距前样式
    this.map.setOptions({
        draggableCursor: 'default'
    });
    this.end();
};
/**
 * 当用户双击时，调用实例的end方法，结束当前路径
 */
MapController.prototype.onDblClick = function() {
    //结束测距，改变鼠标样式为开启测距前样式，禁用双击放大
    this.map.setOptions({
        draggableCursor: 'default',
        disableDoubleClickZoom: true
    });
    this.end();
};
/**
 * 鼠标移出地图平移
 */
MapController.prototype.onMouseOut = function(evt) {
    if (!this._isStart) {
        return;
    }
    var width = this.map.getContainer().offsetWidth;
    var height = this.map.getContainer().offsetHeight;
    var x = evt.pixel.x;
    var y = evt.pixel.y;
    var arrow = '';
    //left、right
    var alpha = height / width;
    if (width / 2 > x) {
        if (Math.abs(height / 2 - y) / (width / 2 - x) < alpha) {
            arrow = 'left';
        }
    } else {
        if (Math.abs(height / 2 - y) / (x - width / 2) < alpha) {
            arrow = 'right';
        }
    }
    //top、bottom
    if (height / 2 > y) {
        if ((height / 2 - y) / Math.abs(width / 2 - x) > alpha) {
            arrow = 'top';
        }
    } else {
        if ((y - height / 2) / Math.abs(width / 2 - x) > alpha) {
            arrow = 'bottom'
        }
    }

    qq.maps.event.trigger(this, "mouseout", evt.latLng);

    this._autoPan(arrow, evt);
};

MapController.prototype.onMouseOver = function(evt) {
    if (this._panByLisenter) {
        clearInterval(this._panByLisenter);
        this._panByLisenter = null;

        qq.maps.event.trigger(this, "mouseover", evt.latLng);
    }
};

MapController.prototype._autoPan = function(arrow, evt) {
    var self = this;
    var panByOffset = {
        x: 0,
        y: 0
    };
    switch (arrow) {
        case 'left':
            panByOffset.x = -5;
            break;
        case 'right':
            panByOffset.x = 5;
            break;
        case 'top':
            panByOffset.y = -5;
            break;
        case 'bottom':
            panByOffset.y = 5;
            break;
    }

    this._panByLisenter = setInterval(function() {
        self.map.panBy(panByOffset.x, panByOffset.y);
        //            qq.maps.event.trigger(self, "position_changed", evt.latLng);
        //            self.onMouseMove(evt);
    }, 50)
};

function Display(mvcArrayPath, map) {
    qq.maps.event.addListener(mvcArrayPath, "insert_at", bindHandler(this.insertAt, this));
    qq.maps.event.addListener(mvcArrayPath, "remove_at", bindHandler(this.removeAt, this));
    this.map = map;
    this.mvcArrayPath = mvcArrayPath;
    this.points = [];
    this.lines = [];
    this.labels = [];
    this.pointController = new qq.maps.MVCObject();
    this.lineController = new qq.maps.MVCObject();
    this.labelController = new qq.maps.MVCObject();
    this.pointController.set("map", map);
    this.lineController.set("map", map);
    this.labelController.set("map", map);
    this.pointController.set("clickable", false);
    this.isEnd = false;

    this.cursorLine = new qq.maps.Polyline({
        map: map,
        strokeDashStyle: "dash",
        strokeWeight: 3,
        strokeColor: new qq.maps.Color(0xfd, 0x5d, 0x5d, 0.8)
    });

    this.dragPoint = new DragPoint({
        map: map
    });

    this.hoverLineIndex = -1;
    this.dragPointIndex = -1;

    var currentDragLine = null;
    var currentDragLinePath = null;
    var startLabel = this.startLabel = new CustomLabel({
        map: map,
        closeBtn: false,
        offset: {
            x: 5,
            y: 10
        }
    });
    startLabel.set("content", "单击选择起点");
    //测距过程中鼠标位置提示框
    var moveLabel = this.moveLabel = new CustomLabel({
        map: map,
        closeBtn: false,
        offset: {
            x: 5,
            y: 10
        }
    });
    //        moveLabel.set("content", "单击选择起点");
    //拖拽标记点的提示框
    var dragLabel = this.dragLabel = new CustomLabel({
        map: map,
        closeBtn: false,
        offset: {
            x: 5,
            y: 10
        }
    });

    var self = this;

    qq.maps.event.addListener(this.dragPoint, "dragstart", function(latlng) {
        currentDragLine = self.lines[self.hoverLineIndex];
        if (currentDragLine) {
            currentDragLinePath = currentDragLine.getPath();
            currentDragLinePath = [currentDragLinePath.getAt(0), currentDragLinePath.getAt(currentDragLinePath.getLength() - 1)];
        }
        if (currentDragLinePath) {
            currentDragLine.setPath([
                currentDragLinePath[0],
                self.dragPoint.get("position"),
                currentDragLinePath[1]
            ])
        }
    });
    qq.maps.event.addListener(this.dragPoint, "drag", function() {
        if (currentDragLinePath) {
            currentDragLine.setPath([
                currentDragLinePath[0],
                self.dragPoint.get("position"),
                currentDragLinePath[1]
            ]);
            self.updateLabelContent();
            self.updateDragLabel(self.dragPoint.get("position"), null, true);
        }
    });
    qq.maps.event.addListener(this.dragPoint, "dragend", function() {
        if (currentDragLinePath) {
            mvcArrayPath.insertAt(currentDragLine._index + 1, self.dragPoint.get("position"));
        }
    });
    //qq.maps.event.addListener(map, "mouseout", function() {
    //            console.log("mouseout");
    //});
}

Display.prototype.end = function() {
    this.isEnd = true;
    this.cursorPosition = null;
    this.pointController.set("clickable", true);
    this.pointController.set("draggable", true);
    this.moveLabel.setMap(null);
    this.moveLabel = null;
    this.startLabel.setMap(null);
    this.startLabel = null;
    this.updateLabelContent();
    this.updateCursorLine();

    if (this.lines.length == 0) {
        //remove point
        var point = this.points[0];
        this._removePoint(point);

        //remove label
        var label = this.labels[0];
        this._removeLabel(label);
    }
};
Display.prototype.isEditing = function() {
    return this.dragPoint.isDragging || this.dragPointIndex >= 0;
};
Display.prototype.insertAt = function(latlng, index) {
    //insert point
    var point = this._createPoint(index);
    this.points.splice(index, 0, point);
    point.setPosition(latlng);

    //insert label
    var label = this._createLabel(index);
    this.labels.splice(index, 0, label);
    //        label.setPosition(latlng);
    label.bindTo("position", point);

    //insert line;
    if (this.points.length > 0) {
        if (this.points[index - 1]) {
            var beforeLine = this.lines[index - 1];
            if (!beforeLine) {
                beforeLine = this._createLine();
                this.lines.splice(index, 0, beforeLine);
            }
            beforeLine.setPath([
                this.mvcArrayPath.getAt(index - 1),
                latlng
            ]);
        }
        if (this.points[index + 1]) {
            var afterLine = this._createLine();
            afterLine.setPath([
                latlng,
                this.mvcArrayPath.getAt(index + 1)
            ]);
            this.lines.splice(index, 0, afterLine);
        }
    }
    this._updateIndex();
    this.updateLabelContent();
    this.updateCursorLine();
};

Display.prototype.removeAt = function(latlng, index) {
    //remove point
    var point = this.points.splice(index, 1)[0];
    this._removePoint(point);

    //remove label
    var label = this.labels.splice(index, 1)[0];
    this._removeLabel(label);

    //remove line
    var line = this.lines.splice(index, 1)[0];
    if (!line) { //如果删除的是最后一个点，则删除前面一条线
        line = this.lines.splice(index - 1, 1)[0];
    }
    //只删除一条线，如果是删除中间的点，下面修改这条线前面的一条线
    if (line) {
        this._removeLine(line);
    }

    if (this.lines.length > 0) {
        //如果是删除中间的点，因为removeAt代表已经出mvcArray中删除，所以取到的length不用-1
        if (index > 0 && index < this.mvcArrayPath.getLength()) {
            var beforeLine = this.lines[index - 1];
            var path = [this.mvcArrayPath.getAt(index - 1), this.mvcArrayPath.getAt(index)];
            beforeLine.setPath(path);
        }
        this._updateIndex();
        this.updateLabelContent();
    } else {
        while (this.mvcArrayPath.getLength()) {
            this.mvcArrayPath.pop();
        }
    }
    this.updateCursorLine();
};
Display.prototype.updateLabelContent = function() {
    var labels = this.labels;
    var i = 0;
    var n = labels.length;
    var distance = 0;
    for (; i < n; i++) {
        if (i == 0) {
            labels[i].set("content", "起点");
        } else if (this.isEnd && i == n - 1) {
            //终点
            distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[i - 1].get("position"), labels[i].get("position"));
            labels[i].set("content", formatDistance(distance, 1));
            labels[i].set("isEnd", true);
        } else {
            distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[i - 1].get("position"), labels[i].get("position"));
            labels[i].set("content", formatDistance(distance, 1));
        }
    }
};
Display.prototype._updateIndex = function() {
    var i, n;
    for (i = 0, n = this.points.length; i < n; i++) {
        this.points[i]._index = i;
    }
    for (i = 0, n = this.labels.length; i < n; i++) {
        this.labels[i]._index = i;
    }
    for (i = 0, n = this.lines.length; i < n; i++) {
        this.lines[i]._index = i;
    }
};
Display.prototype.setCursorPosition = function(latlng) {
    this.startLabel.set("position", latlng);
    this.cursorPosition = latlng;
    this.updateCursorLine();
};
Display.prototype.updateCursorLine = function() {
    var n = this.mvcArrayPath.getLength();
    if (!this.isEnd && n > 0 && this.cursorPosition) {
        this.cursorLine.setPath([
            this.mvcArrayPath.getAt(this.mvcArrayPath.getLength() - 1),
            this.cursorPosition
        ]);
    } else {
        this.cursorLine.setPath([]);
    }

};
Display.prototype.hideCursorLine = function() {
    this.cursorLine.setMap(null);
};
Display.prototype.showCursorLine = function() {
    this.cursorLine.setMap(this.map);
};
Display.prototype.updateMoveLabel = function(latlng) {
    var labels = this.labels;
    var n = labels.length;
    if (n > 0) {
        this.moveLabel.set("position", latlng);
        var distance = 0;
        if (n > 1) {
            for (var i = 1; i < n; i++) {
                distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[i - 1].get("position"), labels[i].get("position"));
                if (i == n - 1) {
                    //最后一个点需要追加当前鼠标位置的距离
                    distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[i].get("position"), latlng);
                }
            }
        } else {
            distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[0].get("position"), latlng);
        }

        var content = '当前' + formatDistance(distance, 1) + '<br/><span style="font-weight:normal">单击左键继续，双击或右键结束</span>';
        this.moveLabel.set("content", content);
    }
};
Display.prototype.updateDragLabel = function(latlng, index, isDrag) {
    var labels = this.labels;
    var n = labels.length;
    this.dragLabel.set("position", latlng);
    if (index || index == 0) {
        this.dragLabel.set("lineIndex", index);
    } else {
        index = this.dragLabel.get("lineIndex");
    }

    var distance = 0;
    for (var i = 1; i <= index; i++) {
        distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[i - 1].get("position"), labels[i].get("position"));
    }
    distance += qq.maps.geometry.spherical.computeDistanceBetween(labels[index].get("position"), latlng);

    var content = isDrag ? formatDistance(distance, 1) : formatDistance(distance, 1) + '<br/><span style="font-weight:normal">拖拽添加一个新点</span>';
    this.dragLabel.set("content", content);
};
Display.prototype._addLineEvents = function(line) {
    var evts = line._evts;
    if (!evts) {
        evts = line._evts = [];
    }
    var self = this;
    evts.push(qq.maps.event.addListener(line, "mousemove", function(evt) {
        if (!self.isEditing()) {
            self.dragPoint.set("position", evt.latLng);
            self.hoverLineIndex = line._index;
            //更新拖拽提示
            self.updateDragLabel(evt.latLng, line._index);
        }
    }));
    evts.push(qq.maps.event.addListener(line, "mouseover", function(evt) {
        if (!self.isEditing()) {
            self.dragPoint.set("position", evt.latLng);
            self.hoverLineIndex = line._index;
            //更新拖拽提示
            self.updateDragLabel(evt.latLng, line._index);
        }
    }));
    evts.push(qq.maps.event.addListener(line, "mouseout", function(evt) {
        if (!self.isEditing()) {
            self.dragPoint.set("position", null);
            self.hoverLineIndex = -1;
            //隐藏拖拽提示
            self.dragLabel.set("position", null);
        }
    }));
};
Display.prototype._removeLineEvents = function(line) {
    var evts = line._evts;
    if (evts) {
        var listener;
        while (listener = evts.pop()) {
            qq.maps.event.removeListener(listener);
        }
    }
};
Display.prototype._addPointEvent = function(marker) {
    var evts = marker._evts;
    if (!evts) {
        evts = marker._evts = [];
    }
    var self = this;
    evts.push(qq.maps.event.addListener(marker, "dragstart", function() {
        self.dragPointIndex = marker._index;
        self.dragPoint.set("position", null);
    }));
    evts.push(qq.maps.event.addListener(marker, "dragging", function() {
        var index = self.dragPointIndex = marker._index;
        var lines = self.lines;
        var currentPosition = marker.getPosition();
        var beforeLine = lines[index - 1];
        if (beforeLine) {
            beforeLine.setPath([
                beforeLine.getPath().getAt(0),
                currentPosition
            ]);
        }
        var afterLine = lines[index];
        if (afterLine) {
            afterLine.setPath([
                currentPosition,
                afterLine.getPath().getAt(1)
            ]);
        }
        self.updateLabelContent();
    }));
    evts.push(qq.maps.event.addListener(marker, "dragend", function() {
        self.dragPointIndex = -1;
        var currentPosition = marker.getPosition();
        var index = marker._index;
        self.mvcArrayPath.insertAt(index, currentPosition);
        self.mvcArrayPath.removeAt(index + 1);
    }));
};
Display.prototype._removePointEvent = Display.prototype._removeLabelEvent = function(point) {
    var evts = point._evts;
    if (evts) {
        var listener;
        while (listener = evts.pop()) {
            qq.maps.event.removeListener(listener);
        }
    }
};
Display.prototype._addLabelEvent = function(label) {
    var evts = label._evts;
    if (!evts) {
        evts = label._evts = [];
    }
    var self = this;
    evts.push(qq.maps.event.addListener(label, "delete", function() {
        self.mvcArrayPath.removeAt(label._index);
    }));
    evts.push(qq.maps.event.addListener(label, "clear", function() {
        self.clear();
    }));
};
Display.prototype._createPoint = function() {
    var anchor = new qq.maps.Point(6, 6),
        size = new qq.maps.Size(11, 11),
        origin = new qq.maps.Point(1, 1);
    var opt = {
        icon: new qq.maps.MarkerImage(
            'http://3gimg.qq.com/lightmap/measure/image/line_red.png',
            size,
            origin,
            anchor)
    };
    var point = new qq.maps.Marker(opt);
    point.bindTo("map", this.pointController);
    point.bindTo("clickable", this.pointController);
    point.bindTo("draggable", this.pointController);
    this._addPointEvent(point);
    return point;
};
Display.prototype._createLabel = function() {
    var label = new CustomLabel();
    label.bindTo("map", this.labelController);
    this._addLabelEvent(label);
    return label;
};
Display.prototype._createLine = function() {
    var line = new qq.maps.Polyline({
        strokeWeight: 3,
        strokeColor: new qq.maps.Color(0xfd, 0x5d, 0x5d, 0.8)
    });
    line.bindTo("map", this.labelController);
    this._addLineEvents(line);
    return line;
};
Display.prototype._removePoint = function(point) {
    if (point) {
        this._removePointEvent(point);
        point.unbindAll();
        point.setMap(null);
        point.setPosition(null);
    }
};
Display.prototype._removeLabel = function(label) {
    if (label) {
        this._removeLabelEvent(label);
        label.unbindAll();
        label.setMap(null);
        label.set("position", null);
        label.set("content", null);
    }
};
Display.prototype._removeLine = function(line) {
    this._removeLineEvents(line);
    line.unbindAll();
    line.setMap(null);
    line.setPath([]);
};
Display.prototype.clear = function() {
    while (this.mvcArrayPath.getLength() > 0) {
        this.mvcArrayPath.pop();
    }
};

var DragPoint = function(opts) {
    this.evts = [];
    this.isDragging = false;
    qq.maps.Overlay.call(this, opts);

    //        this.mask = new qq.maps.drawing.DrawingMask();
};

//继承Overlay基类
DragPoint.prototype = new qq.maps.Overlay();
DragPoint.prototype.construct = function() {
    this.dom = createNode('div', {
        'style': 'display: none',
        'className': 'distanceDragPoint'
    });

    //将dom添加到覆盖物层
    this.getPanes().overlayImage.appendChild(this.dom);
    var map = this.get("map");
    var self = this;
    this.evts.push(qq.maps.event.addListener(map, "mousedown", function(evt) {
        if (self.get("position")) {
            self.isDragging = true;
            map.setOptions({
                draggable: false
            });
            qq.maps.event.trigger(self, "dragstart");
        }
    }));
    this.evts.push(qq.maps.event.addListener(map, "mousemove", function(evt) {
        if (self.isDragging) {
            self.set("position", evt.latLng);
            qq.maps.event.trigger(self, "drag");
        }
    }));
    this.evts.push(qq.maps.event.addListener(map, "mouseup", function(evt) {
        self.isDragging = false;
        //            this.mask.setMap(null);
        map.setOptions({
            draggable: true
        });
        qq.maps.event.trigger(self, "dragend");
    }));
};

DragPoint.prototype.draw = function() {
    //获取地理经纬度坐标
    var position = this.get('position');
    if (position) {
        var pixel = this.getProjection().fromLatLngToDivPixel(position);
        this.dom.style.left = pixel.getX() - 6 + 'px';
        this.dom.style.top = pixel.getY() - 6 + 'px';
        this.dom.style.display = "block";
    } else {
        this.dom.style.display = "none";
        this.isDragging = false;
    }
};

DragPoint.prototype.destroy = function() {
    //移除dom
    this.dom.parentNode.removeChild(this.dom);
    var listener;
    while (listener = this.evts.pop()) {
        qq.maps.event.removeListener(listener);
    }
    //        this.mask = null;
};
DragPoint.prototype.position_changed = function() {
    //        var map = this.get('map');
    //        this.mask.setMap(map);
    this.draw();
};

function CustomLabel(opts) {
    opts = opts ? opts : {};

    this.closeBtn = opts.closeBtn == false ? opts.closeBtn : true;
    this.offset = opts.offset ? opts.offset : {
        x: 8,
        y: -10
    };

    qq.maps.Overlay.call(this, opts);
};

//继承Overlay基类
CustomLabel.prototype = new qq.maps.Overlay();
CustomLabel.prototype.construct = function() {
    var div = this.div = document.createElement('div');
    div.className = 'distanceLabel';
    div.style.cssText = 'display:none;';

    var con = createNode('div', null, div);
    var span = this.span = document.createElement("span");
    con.appendChild(span);
    //        var btnDelete = this.btnDelete = document.createElement("img");
    if (this.closeBtn) {
        var self = this;
        var btnDelete = this.btnDelete = createNode('img', {
            className: 'distanceDeleteIcon'
        }, con);

        this.evt1 = qq.maps.event.addListener(btnDelete, "click", function() {
            qq.maps.event.trigger(self, "delete");
        });

        var btnClear = this.btnClear = createNode('img', {
            style: 'display: none;',
            className: 'distanceClear'
        }, con);
        this.evt2 = qq.maps.event.addListener(btnClear, "click", function() {
            qq.maps.event.trigger(self, "clear");
        });
    }
    //        btnDelete.innerHTML = "x";
    //        var self = this;
    //        this.evt1 = qq.maps.event.addListener(btnDelete, "click", function () {
    //            qq.maps.event.trigger(self, "delete");
    //        });

    //        con.appendChild(btnDelete);
    //将dom添加到覆盖物层
    this.getPanes().overlayMouseTarget.appendChild(div);
};

CustomLabel.prototype.draw = function() {
    //获取地理经纬度坐标
    var position = this.get('position');
    var offset = this.get('offset');
    if (this.div) {
        var divStyle = this.div.style;
        if (position) {
            var pixel = this.getProjection().fromLatLngToDivPixel(position);
            divStyle.left = pixel.getX() + offset.x + 'px';
            divStyle.top = pixel.getY() + offset.y + 'px';
            divStyle.display = "block";
            this.updateContent();
        } else {
            divStyle.display = "none";
        }
    }

};
CustomLabel.prototype.updateContent = function() {
    if (!this.div) {
        return;
    }
    this.span.innerHTML = this.get("content") || "";
};

CustomLabel.prototype.destroy = function() {
    //移除dom
    this.div.parentNode.removeChild(this.div);
    if (this.closeBtn) {
        qq.maps.event.removeListener(this.evt1);
        this.evt1 = null;
        qq.maps.event.removeListener(this.evt2);
        this.evt2 = null;
        this.btnDelete = null;
        this.btnClear = null;
    }
    this.div = null;
};
CustomLabel.prototype.showClearBtn = function() {
    if (this.closeBtn && this.btnClear) {
        this.btnClear.style.display = '';
    }
};
CustomLabel.prototype.content_changed = function() {
    this.updateContent();
};
CustomLabel.prototype.isEnd_changed = function() {
    this.showClearBtn();
};
CustomLabel.prototype.position_changed = function() {
    this.draw();
};

function formatDistance(distance, precision) {
    if (typeof precision === "number" && precision > 0) {
        precision = Math.ceil(precision);
        distance = distance.toFixed(precision);
    }
    if (distance < 1000) {
        return [distance, '米'].join('');
    } else {
        // 当为公里单位时，保留一位即好了
        distance = Math.round(distance / 100) * 100;
        return [distance / 1000, '公里'].join('');
    }
};
