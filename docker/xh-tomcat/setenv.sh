export JAVA_OPTS="$JAVA_OPTS -Xmx${XH_XMX:=2g} -Dio.xh.hoist.environment=${XH_ENV:=Development} ${XH_JAVA_OPTS}"