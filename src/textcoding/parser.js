/*
 *
 */
"use strict";

require("./util/console")

Entry.Parser = function(mode, type, cm, syntax) {
    this._mode = mode; // maze ai workspace
    this.syntax = {}; //for maze
    this.codeMirror = cm;

    this._lang = syntax;
    this._type = type;
    this.availableCode = [];
    this._syntax_cache = {};
    this._pyThreadCount = 1;
    this._pyBlockCount = {};

    Entry.Parser.PARSE_GENERAL = 1;
    Entry.Parser.PARSE_SYNTAX = 2;
    Entry.Parser.PARSE_VARIABLE = 3;
    Entry.Parser.PARSE_BLOCK = 4;

    this._onError = false;
    this._onRunError = false;

    if (Entry.type === "workspace") {
        this._console = new Entry.Console();

        var hwFunc = function() {
            var _mode = this._mode;
            if (_mode === null) return;
            this.setAvailableCode();

            delete this._syntax_cache[_mode];
            this.syntax = this.mappingSyntax(_mode);
            this._pyHinter && this._pyHinter.setSyntax(this.syntax);
        }.bind(this);

        //after hw code generated update syntax for this
        //and update python hinter syntax
        Entry.addEventListener('hwCodeGenerated', hwFunc);
    }

};

(function(p) {
    var SYNTAX_MAP = {
        "Hamster.LINE_TRACER_MODE_OFF": '0',
        "Hamster.LINE_TRACER_MODE_BLACK_LEFT_SENSOR": '1',
        "Hamster.LINE_TRACER_MODE_BLACK_RIGHT_SENSOR": '2',
        "Hamster.LINE_TRACER_MODE_BLACK_BOTH_SENSORS": '3',
        "Hamster.LINE_TRACER_MODE_BLACK_TURN_LEFT": '4',
        "Hamster.LINE_TRACER_MODE_BLACK_TURN_RIGHT": '5',
        "Hamster.LINE_TRACER_MODE_BLACK_MOVE_FORWARD": '6',
        "Hamster.LINE_TRACER_MODE_BLACK_UTURN": '7',
        "Hamster.LINE_TRACER_MODE_WHITE_LEFT_SENSOR": '8',
        "Hamster.LINE_TRACER_MODE_WHITE_RIGHT_SENSOR": '9',
        "Hamster.LINE_TRACER_MODE_WHITE_BOTH_SENSORS": '10',
        "Hamster.LINE_TRACER_MODE_WHITE_TURN_LEFT": '11',
        "Hamster.LINE_TRACER_MODE_WHITE_TURN_RIGHT": '12',
        "Hamster.LINE_TRACER_MODE_WHITE_MOVE_FORWARD": '13',
        "Hamster.LINE_TRACER_MODE_WHITE_UTURN": '14',

        "Hamster.LED_OFF": '0',
        "Hamster.LED_BLUE": '1',
        "Hamster.LED_GREEN": '2',
        "Hamster.LED_CYAN": '3',
        "Hamster.LED_RED": '4',
        "Hamster.LED_MAGENTA": '5',
        "Hamster.LED_YELLOW": '6',
        "Hamster.LED_WHITE": '7',

        "Hamster.IO_MODE_ANALOG_INPUT": '0',
        "Hamster.IO_MODE_DIGITAL_INPUT": '1',
        "Hamster.IO_MODE_SERVO_OUTPUT": '8',
        "Hamster.IO_MODE_PWM_OUTPUT": '9',
        "Hamster.IO_MODE_DIGITAL_OUTPUT": '10'
    };

    p.setParser = function(mode, type, cm) {
        if (this._mode === mode && this._type === type)
            return;

        this._mode = mode;
        this._type = type;
        this._cm = cm;

        this.syntax = this.mappingSyntax(mode);

        switch (type) {
            case Entry.Vim.PARSER_TYPE_JS_TO_BLOCK:
                this._execParser = new Entry.JsToBlockParser(this.syntax, this);
                this._execParserType = Entry.Vim.PARSER_TYPE_JS_TO_BLOCK;
                break;
            case Entry.Vim.PARSER_TYPE_PY_TO_BLOCK:
                this._execParser = new Entry.PyToBlockParser(this.syntax);
                this._execParserType = Entry.Vim.PARSER_TYPE_PY_TO_BLOCK;
                break;
            case Entry.Vim.PARSER_TYPE_BLOCK_TO_JS:
                this._execParser = new Entry.BlockToJsParser(this.syntax, this);
                this._execParserType = Entry.Vim.PARSER_TYPE_BLOCK_TO_JS;
                break;
            case Entry.Vim.PARSER_TYPE_BLOCK_TO_PY:
                this._execParser = new Entry.BlockToPyParser(this.syntax);
                cm && cm.setOption("mode", {name: "python", globalVars: true});
                this._execParserType = Entry.Vim.PARSER_TYPE_BLOCK_TO_PY;
                break;
        }
    };

    p.parse = function(code, parseMode) {
        var type = this._type;
        var result = "";

        switch (type) {
            case Entry.Vim.PARSER_TYPE_JS_TO_BLOCK:
                try {
                    var threads = [];
                    threads.push(code);
                    var astArray = [];

                    for(var index in threads) {
                        var thread = threads[index];
                        thread = thread.trim();
                        var ast = acorn.parse(thread);
                        astArray.push(ast);
                    }

                    result = this._execParser.Program(astArray);
                } catch (error) {
                    if (this.codeMirror) {
                        var annotation;
                        if (error instanceof SyntaxError) {
                            annotation = {
                                from: {line: error.loc.line - 1, ch: 0},
                                to: {line: error.loc.line - 1, ch: error.loc.column}
                            }
                            error.message = "문법(Syntax) 오류입니다.";
                            error.type = 1;
                        } else {
                            annotation = this.getLineNumber(error.node.start, error.node.end);
                            annotation.message = error.message;
                            annotation.severity = "converting error";
                            error.type = 2;
                        }

                        this.codeMirror.markText(
                            annotation.from, annotation.to, {
                            className: "CodeMirror-lint-mark-error",
                            __annotation: annotation,
                            clearOnEnter: true
                        });

                        var errorTitle;
                        if(error.title)
                            errorTitle = error.title;
                        else
                            errorTitle = '문법 오류';

                        var errorMsg;
                        if(error.type == 2 && error.message)
                            errorMsg = error.message;
                        else if(error.type == 2 && !error.message)
                            errorMsg = '자바스크립트 코드를 확인해주세요.';
                        else  if(error.type == 1)
                            errorMsg = '자바스크립트 문법을 확인해주세요.';

                        Entry.toast.alert(errorTitle, errorMsg);

                        var mode = {};
                        mode.boardType = Entry.Workspace.MODE_BOARD;
                        mode.textType = Entry.Vim.TEXT_TYPE_JS;
                        mode.runType = Entry.Vim.MAZE_MODE;
                        Ntry.dispatchEvent("textError", mode);
                        throw error;
                    }
                    result = [];
                }
                break;
            case Entry.Vim.PARSER_TYPE_PY_TO_BLOCK:
                try {
                    this._pyBlockCount = {};
                    this._pyThreadCount = 1;

                    var pyAstGenerator = new Entry.PyAstGenerator();
                    var threads = this.makeThreads(code);

                    var astArray = [];
                    var threadCount = 0;
                    var ast;
                    for(var index = 0; index < threads.length; index++) {
                        var thread = threads[index];
                        if(thread.length === 0)
                            continue;
                        thread = thread.replace(/\t/gm, '    ');
                        ast = pyAstGenerator.generate(thread);
                        if(!ast)
                            continue;
                        this._pyThreadCount = threadCount++;
                        this._pyBlockCount[threadCount] = thread.split("\n").length-1;
                        if (ast.body.length !== 0)
                            astArray.push(ast);
                    }
                    result = this._execParser.Programs(astArray);
                    this._onError = false;
                    break;
                } catch(error) {
                    this._onError = true;
                    result = [];

                    if (this.codeMirror) {
                        var line;
                        if (error instanceof SyntaxError) {
                            var err = this.findSyntaxError(error);
                            var annotation = {
                                from: {line: err.from.line-1, ch: err.from.ch},
                                to: {line: err.to.line-1, ch: err.to.ch}
                            };
                            error.type = "syntax";
                        } else {
                            var err = error.line;
                            var annotation = {
                                from: {line: err.start.line + 1, ch: err.start.column},
                                to: {line: err.end.line + 1, ch: err.end.column}
                            };
                            error.type = "converting";
                        }

                        var option = {
                            className: "CodeMirror-lint-mark-error",
                            __annotation: annotation,
                            clearOnEnter: true,
                            inclusiveLeft: true,
                            inclusiveRigth: true,
                            clearWhenEmpty: false
                        };

                        this._marker = this.codeMirror.markText(
                            annotation.from, annotation.to, option);

                        if(error.type == "syntax") {
                            var title = error.title;
                            var message = this.makeSyntaxErrorDisplay(error.subject, error.keyword, error.message, err.from.line);
                        }
                        else if(error.type == "converting") {
                            var title = error.title;
                            var message = error.message;

                        }

                        Entry.toast.alert(title, message);
                        throw error;
                    }
                }

                break;

            case Entry.Vim.PARSER_TYPE_BLOCK_TO_JS:
                var textCode = this._execParser.Code(code, parseMode);
                result = textCode;
                break;
            case Entry.Vim.PARSER_TYPE_BLOCK_TO_PY:
                try {
                    Entry.getMainWS().blockMenu.renderText();
                    result = "";

                    if (parseMode === Entry.Parser.PARSE_BLOCK &&
                    code.type.substr(0, 5) === "func_") {
                        var funcKeysBackup = Object.keys(this._execParser._funcDefMap);
                    }

                    var textCode = this._execParser.Code(code, parseMode);
                    if (!this._pyHinter)
                        this._pyHinter = new Entry.PyHint(this.syntax);

                    if(!this._hasDeclaration)
                        this.initDeclaration();

                    if(parseMode == Entry.Parser.PARSE_GENERAL) {
                        if(this.py_variableDeclaration)
                            result += this.py_variableDeclaration;

                        if(this.py_listDeclaration)
                            result += this.py_listDeclaration;

                        if(this.py_variableDeclaration || this.py_listDeclaration)
                            result += '\n';

                        var funcDefMap = this._execParser._funcDefMap;
                        var fd = "";

                        for(var f in funcDefMap) {
                            var funcDef = funcDefMap[f];
                            fd += funcDef + '\n\n';
                        }
                        result += fd;
                    } else if (parseMode === Entry.Parser.PARSE_BLOCK) {
                        if (funcKeysBackup && funcKeysBackup.indexOf(code.type) < 0) {
                            result += this._execParser._funcDefMap[code.type] + '\n\n';
                        }
                    }
                    if(textCode)
                        result += textCode.trim();

                    result = result.replace(/\t/g, "    ");
                    if(this._hasDeclaration)
                        this.removeDeclaration();
                } catch (e) {
                    if (e.block) {
                        Entry.toast.alert(Lang.TextCoding.title_converting, Lang.TextCoding.alert_legacy_no_support);
                    }
                    throw e;
                }

                break;
        }

        return result;
    };

    p.getLineNumber = function (start, end) {
        var value = this.codeMirror.getValue();
        var lines = {
            'from' : {},
            'to' : {}
        };

        var startline = value.substring(0, start).split(/\n/gi);
        lines.from.line = startline.length - 1;
        lines.from.ch = startline[startline.length - 1].length;

        var endline = value.substring(0, end).split(/\n/gi);
        lines.to.line = endline.length - 1;
        lines.to.ch = endline[endline.length - 1].length;

        return lines;
    };

    p.mappingSyntax = function(mode) {
        var that = this;
        if (this._syntax_cache[mode])
            return this._syntax_cache[mode];

        var types = Object.keys(Entry.block);
        var availables = this.setAvailableCode();
        var syntax = {};
        if(mode === Entry.Vim.WORKSPACE_MODE)
            syntax["#dic"] = {};

        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            //if (Entry.type !== 'invisible' && (availables && (availables.indexOf(type) < 0)))
                //continue;

            if (mode === Entry.Vim.MAZE_MODE &&
                (availables && (availables.indexOf(type) < 0)))
                continue;

            var block = Entry.block[type];

            if (mode === Entry.Vim.MAZE_MODE) {
                var syntaxArray = block.syntax;
                if (!syntaxArray)
                    continue;

                if(block.syntax.py)
                    continue;

                var syntaxTemp = syntax;

                for (var j = 0; j < syntaxArray.length; j++) {
                    var key = syntaxArray[j];
                    if (j === syntaxArray.length - 2 &&
                        typeof syntaxArray[j + 1] === "function") {
                        syntaxTemp[key] = syntaxArray[j + 1];
                        break;
                    }
                    if (!syntaxTemp[key]) {
                        syntaxTemp[key] = {};
                    }
                    if (j === syntaxArray.length - 1) {
                        syntaxTemp[key] = type;
                    } else {
                        syntaxTemp = syntaxTemp[key];
                    }
                }
            } else if (mode === Entry.Vim.WORKSPACE_MODE) {
                var key = type;
                var pySyntax = block.syntax && block.syntax.py;

                if (!pySyntax) continue;

                pySyntax.map(function(s, i) {
                    var result, tokens;

                    if (typeof s === "string") {
                        result = {};
                        tokens = s;
                        result.key = key;
                        result.syntax = s;
                        result.template = s;
                    } else {
                        result = s;
                        tokens = s.syntax;
                        s.key = key;
                        if (!s.template) result.template = s.syntax;
                        if (s.dic) syntax["#dic"][s.dic] = key;
                    }
                    if (i === 0)
                        result.isDefault = true;

                    tokens = tokens.split('(');

                    if (/%/.test(tokens[1])) {
                        if (tokens[0].length) tokens = tokens[0];
                        else tokens = tokens.join('(');
                    } else tokens = tokens.join('(');

                    tokens = tokens.replace(/\(\):?/, "");

                    if (s.keyOption) tokens += "#" + s.keyOption;

                    tokens = tokens.split(".");

                    var newTokens = [];
                    newTokens.push(tokens.shift());
                    var restToken = tokens.join('.');
                    if (restToken !== '') newTokens.push(restToken);
                    tokens = newTokens;

                    var syntaxPointer = syntax;
                    for (var i = 0; i < tokens.length; i++) {
                        var syntaxKey = tokens[i];
                        if (i === tokens.length - 1) {
                            syntaxPointer[syntaxKey] = result;
                            var anotherKey = that._getAnotherSyntaxKey(syntaxKey);
                            if (anotherKey)
                                syntaxPointer[anotherKey] = result;
                            break;
                        }
                        if (!syntaxPointer[syntaxKey]) syntaxPointer[syntaxKey] = {};
                        syntaxPointer = syntaxPointer[syntaxKey];
                    }
                });
            }
        }
        this._syntax_cache[mode] = syntax;
        return syntax;
    };

    p.setAvailableCode = function () {
        var WS = Entry.getMainWS();
        if (!WS) return;

        var blockMenu = WS.blockMenu;
        var board = WS.board;
        var container = Entry.conatainer;

        var blocks = [];

        if (blockMenu && blockMenu.code) {
            blocks = blocks.concat(blockMenu.code.getBlockList());
        }

        if (container) {
            blocks = blocks.concat(container.getBlockList());
        } else if (!container && board && board.code) {
            blocks = blocks.concat(board.code.getBlockList());
        }

        blocks = blocks.map(function(b) { return b.type });
        blocks = blocks.filter(function(b, index) {
            return blocks.indexOf(b) === index;
        });

        this.availableCode = blocks;

        return blocks;
    };

    p.findSyntaxError = function(error, threadCount) {
        var loc = error.loc;
        loc.line = loc.line + 2;
        return {
            from: {line: loc.line, ch: loc.column},
            to: {line: loc.line, ch: loc.column + error.tokLen}
        };
    };

    p.makeThreads = function(text) {
        var textArr = text.split("\n");
        var thread = "";
        var threads = [];

        var optText = "";
        var onEntryEvent = false;

        var startLine = 0;
        for(var i = 3; i < textArr.length; i++) {
            var textLine = textArr[i] + "\n";
            if(Entry.TextCodingUtil.isEntryEventFuncByFullText(textLine)) {
                textLine = this.entryEventParamConverter(textLine);
                if(optText.length !== 0) {
                    threads.push(makeLine(optText));
                    startLine = i - 2;
                }

                optText = "";
                optText += textLine;
                onEntryEvent = true;
            } else {
                if(Entry.TextCodingUtil.isEntryEventFuncByFullText(textLine.trim()))
                    textLine = this.entryEventParamConverter(textLine);
                if(textLine.length == 1 && !onEntryEvent) { //empty line
                    threads.push(makeLine(optText));
                    startLine = i - 2;
                    optText = "";
                }
                else if(textLine.length != 1 && textLine.charAt(0) != ' ' && onEntryEvent) { //general line
                    threads.push(makeLine(optText));
                    startLine = i - 2;
                    optText = "";
                    onEntryEvent = false;
                }

                optText += textLine;


            }
        }

        threads.push(makeLine(optText));
        function makeLine(text) {
            return new Array( startLine + 1 ).join( "\n" ) + text;
        }
        return threads;
    };

    p.entryEventParamConverter = function(text) {
        return text;
    };

    p.makeSyntaxErrorDisplay = function(subject, keyword, message, line) {
        var kw;
        if(keyword) kw = "\'" + keyword + "\' ";
        else kw = '';

        return '[' + subject + ']' + ' ' + kw + ' : ' +
                    message + ' ' + '(line ' + line + ')';
    };

    p.initDeclaration = function() {
        this.py_variableDeclaration = Entry.TextCodingUtil.generateVariablesDeclaration();
        this.py_listDeclaration = Entry.TextCodingUtil.generateListsDeclaration();
        this._hasDeclaration = true;
    };

    p.removeDeclaration = function() {
        this.py_variableDeclaration = null;
        this.py_listDeclaration = null;
    };

    p._getAnotherSyntaxKey = function(syntax) {
        var replaced = false;
        for (var key in SYNTAX_MAP) {
            if (syntax.indexOf(key) > -1) {
                replaced = true;
                syntax = syntax.replace(new RegExp(key, "gm"), SYNTAX_MAP[key]);
            }
        }

        if (replaced) return syntax;
    };
})(Entry.Parser.prototype);
